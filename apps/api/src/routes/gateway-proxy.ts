/**
 * Gateway Proxy — exposes each employee's OpenClaw gateway through the API server.
 *
 * This eliminates the need for DNS, Traefik, or manual setup. The API server
 * (already exposed on port 3001) proxies HTTP and WebSocket traffic to the
 * container's internal gateway on the Docker network.
 *
 * HTTP:  /gw/:id/*  → http://{containerHost}:18789/*
 * WS:   /gw/:id/*  → ws://{containerHost}:18789/*
 */
import type { FastifyInstance } from "fastify";
import { createConnection, type Socket } from "net";
import type { IncomingMessage } from "http";
import { request as httpRequest } from "http";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";

const GATEWAY_PORT = 18789;
// Extension relay — no separate server; relay HTTP/WS routes proxy to the gateway directly.
const RELAY_PORT = GATEWAY_PORT;

async function getContainerHost(employeeId: string): Promise<string | null> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { containerHost: true, containerPort: true },
  });
  return emp?.containerHost || null;
}

async function getEmployeeGatewayToken(employeeId: string): Promise<string | null> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { gatewayToken: true },
  });
  return emp?.gatewayToken || null;
}

export async function gatewayProxyRoutes(fastify: FastifyInstance) {
  // ── WebSocket diagnostic: test gateway WS handshake from API server ──
  fastify.get<{ Params: { id: string } }>("/test-ws/:id", async (request, reply) => {
    const { id } = request.params;
    const host = await getContainerHost(id);
    if (!host) return reply.status(404).send({ error: "No container host" });

    const token = await getEmployeeGatewayToken(id);
    const wsKey = randomBytes(16).toString("base64");
    const path = token ? `/?token=${encodeURIComponent(token)}` : "/";

    return new Promise((resolve) => {
      const results: Record<string, unknown> = { host, port: GATEWAY_PORT, path, tokenLength: token?.length };
      const timeout = setTimeout(() => {
        results.error = "timeout (5s)";
        resolve(reply.send(results));
      }, 5000);

      const conn = createConnection({ host, port: GATEWAY_PORT }, () => {
        const upgradeReq = [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${GATEWAY_PORT}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Version: 13`,
          `Sec-WebSocket-Key: ${wsKey}`,
          ``, ``
        ].join("\r\n");
        conn.write(upgradeReq);
      });

      let responseData = "";
      conn.on("data", (chunk) => {
        responseData += chunk.toString();
        // Once we have the upgrade response header, parse it
        if (responseData.includes("\r\n\r\n") && !results.upgradeResponse) {
          const headerEnd = responseData.indexOf("\r\n\r\n");
          results.upgradeResponse = responseData.slice(0, headerEnd);
          const statusMatch = responseData.match(/^HTTP\/[\d.]+ (\d+)/);
          results.statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

          if (results.statusCode === 101) {
            // WebSocket is open — wait briefly for first message
            results.wsOpen = true;
            setTimeout(() => {
              // Capture any WS frames received
              const afterHeader = responseData.slice(headerEnd + 4);
              if (afterHeader.length > 0) {
                // Try to decode WebSocket text frames
                results.firstFrameBytes = afterHeader.length;
                try {
                  const buf = Buffer.from(afterHeader);
                  results.firstBytesHex = buf.slice(0, 10).toString("hex");
                  // Simple text frame decode: first byte=0x81, second byte=payload len
                  if ((buf[0] & 0x0f) === 0x01 && buf.length > 2) {
                    let payloadLen = buf[1] & 0x7f;
                    let offset = 2;
                    if (payloadLen === 126) {
                      payloadLen = buf.readUInt16BE(2);
                      offset = 4;
                    }
                    const payload = buf.slice(offset, offset + payloadLen).toString();
                    results.firstMessage = payload;
                  }
                } catch (e: any) { results.decodeError = e.message; }
              }
              clearTimeout(timeout);
              conn.destroy();
              resolve(reply.send(results));
            }, 1000);
          } else {
            clearTimeout(timeout);
            conn.destroy();
            resolve(reply.send(results));
          }
        }
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        results.connectionError = err.message;
        resolve(reply.send(results));
      });

      conn.on("close", () => {
        if (!results.upgradeResponse && !results.connectionError) {
          clearTimeout(timeout);
          results.error = "connection closed before response";
          resolve(reply.send(results));
        }
      });
    });
  });
  // ── HTTP Proxy: /gw/:id and /gw/:id/* ────────────────────────────

  const httpHandler = async (request: any, reply: any) => {
    const { id } = request.params;
    const wildcard = request.params["*"] || "";

    const host = await getContainerHost(id);
    if (!host) {
      return reply.status(502).send({ error: "Employee container not available" });
    }

    try {
      const targetUrl = `http://${host}:${GATEWAY_PORT}/${wildcard}`;
      const method = request.method as string;

      // Forward relevant headers
      const fwdHeaders: Record<string, string> = {};
      for (const [key, val] of Object.entries(request.headers)) {
        if (["host", "connection", "transfer-encoding", "content-length"].includes(key)) continue;
        if (typeof val === "string") fwdHeaders[key] = val;
      }

      const hasBody = !["GET", "HEAD", "OPTIONS"].includes(method);
      let body: string | undefined;
      if (hasBody && request.body != null) {
        body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
        fwdHeaders["content-type"] = fwdHeaders["content-type"] || "application/json";
      }

      const res = await fetch(targetUrl, {
        method,
        headers: fwdHeaders,
        body,
        signal: AbortSignal.timeout(120_000),
      });

      reply.status(res.status);
      for (const [k, v] of res.headers) {
        if (["transfer-encoding", "connection"].includes(k)) continue;
        reply.header(k, v);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return reply.send(buffer);
    } catch (err: any) {
      fastify.log.error(`[gateway-proxy] HTTP error for ${id}: ${err.message}`);
      return reply.status(502).send({ error: `Gateway proxy error: ${err.message}` });
    }
  };

  // Match /gw/:id (base path, no trailing content)
  fastify.route<{ Params: { id: string } }>({
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    url: "/gw/:id",
    handler: httpHandler,
  });

  // Match /gw/:id/* (any sub-path)
  fastify.route<{ Params: { id: string; "*": string } }>({
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    url: "/gw/:id/*",
    handler: httpHandler,
  });

  // ── HTTP Proxy for extension relay: /relay/:id/* → gateway (18789) ────

  const relayHttpHandler = async (request: any, reply: any) => {
    const { id } = request.params;
    const wildcard = request.params["*"] || "";

    const host = await getContainerHost(id);
    if (!host) {
      return reply.status(502).send({ error: "Employee container not available" });
    }

    try {
      const targetUrl = `http://${host}:${RELAY_PORT}/${wildcard}`;
      const method = request.method as string;

      const fwdHeaders: Record<string, string> = {};
      for (const [key, val] of Object.entries(request.headers)) {
        if (["host", "connection", "transfer-encoding", "content-length"].includes(key)) continue;
        if (typeof val === "string") fwdHeaders[key] = val;
      }

      const hasBody = !["GET", "HEAD", "OPTIONS"].includes(method);
      let body: string | undefined;
      if (hasBody && request.body != null) {
        body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
        fwdHeaders["content-type"] = fwdHeaders["content-type"] || "application/json";
      }

      const res = await fetch(targetUrl, {
        method,
        headers: fwdHeaders,
        body,
        signal: AbortSignal.timeout(120_000),
      });

      reply.status(res.status);
      for (const [k, v] of res.headers) {
        if (["transfer-encoding", "connection"].includes(k)) continue;
        reply.header(k, v);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return reply.send(buffer);
    } catch (err: any) {
      fastify.log.error(`[relay-proxy] HTTP error for ${id}: ${err.message}`);
      return reply.status(502).send({ error: `Relay proxy error: ${err.message}` });
    }
  };

  fastify.route<{ Params: { id: string } }>({
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    url: "/relay/:id",
    handler: relayHttpHandler,
  });

  fastify.route<{ Params: { id: string; "*": string } }>({
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    url: "/relay/:id/*",
    handler: relayHttpHandler,
  });

  // ── WebSocket Proxy: upgrade events for /gw/:id/* and /relay/:id/* ──

  fastify.server.on("upgrade", async (req: IncomingMessage, socket: Socket, head: Buffer) => {
    try {
      const rawUrl = req.url || "";
      // Separate path from query string — req.url includes ?token=xxx etc.
      const qIdx = rawUrl.indexOf("?");
      const urlPath = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
      const queryString = qIdx >= 0 ? rawUrl.slice(qIdx) : "";

      // Match /relay/:id/* (extension relay — bridged to gateway on port 18789)
      const relayMatch = urlPath.match(/^\/relay\/([^/]+)(\/.*)?$/);
      // Match /gw/:id/* (gateway, port 18789)
      const gwMatch = urlPath.match(/^\/gw\/([^/]+)(\/.*)?$/);

      const match = relayMatch || gwMatch;
      if (!match) return; // Not our request — let Fastify/other handlers deal with it

      // Both relay and gateway connections go to the OpenClaw gateway (18789).
      // The extension speaks the gateway's operator protocol directly.
      const port = GATEWAY_PORT;
      const employeeId = match[1];
      // For relay connections, always forward to "/" — the extension sub-path
      // (/extension) is just for routing; the gateway only accepts WS at root.
      // For gateway (/gw/) connections, preserve the original sub-path.
      // Always preserve the query string (contains auth token).
      const basePath = relayMatch ? "/" : (match[2] || "/");
      const remainingPath = basePath + queryString;

      const host = await getContainerHost(employeeId);
      if (!host) {
        fastify.log.warn(`[proxy] WS upgrade: no container host for ${employeeId}`);
        socket.write("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\n\r\nEmployee container not available");
        socket.destroy();
        return;
      }

      fastify.log.info(`[proxy] WS upgrade: ${relayMatch ? "relay" : "gw"} employee=${employeeId} → ${host}:${port}${remainingPath}`);

      // Connect to the container via TCP
      const upstream = createConnection({ host, port }, () => {
        // Reconstruct the HTTP upgrade request to forward to the container
        let rawRequest = `${req.method} ${remainingPath} HTTP/1.1\r\n`;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const key = req.rawHeaders[i];
          const val = req.rawHeaders[i + 1];
          // Replace Host header with the container host
          if (key.toLowerCase() === "host") {
            rawRequest += `Host: ${host}:${port}\r\n`;
          } else {
            rawRequest += `${key}: ${val}\r\n`;
          }
        }
        rawRequest += "\r\n";

        upstream.write(rawRequest);
        if (head.length) upstream.write(head);

        // Pipe both directions — full duplex TCP relay
        upstream.pipe(socket);
        socket.pipe(upstream);
      });

      upstream.on("error", (err) => {
        fastify.log.error(`[proxy] WS upstream error for ${employeeId}: ${err.message}`);
        try {
          socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        } catch {}
        socket.destroy();
      });

      socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.on("close", () => socket.destroy());
    } catch (err: any) {
      fastify.log.error(`[proxy] WS handler error: ${err.message}`);
      try {
        socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      } catch {}
      socket.destroy();
    }
  });
}

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

export async function gatewayProxyRoutes(fastify: FastifyInstance) {
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
      const url = req.url || "";

      // Match /relay/:id/* (extension relay — bridged to gateway on port 18789)
      const relayMatch = url.match(/^\/relay\/([^/]+)(\/.*)?$/);
      // Match /gw/:id/* (gateway, port 18789)
      const gwMatch = url.match(/^\/gw\/([^/]+)(\/.*)?$/);

      const match = relayMatch || gwMatch;
      if (!match) return; // Not our request — let Fastify/other handlers deal with it

      // Both relay and gateway connections go to the OpenClaw gateway (18789).
      // The extension speaks the gateway's operator protocol directly.
      const port = GATEWAY_PORT;
      const employeeId = match[1];
      // For relay connections, always forward to "/" — the extension sub-path
      // (/extension) is just for routing; the gateway only accepts WS at root.
      // For gateway (/gw/) connections, preserve the original sub-path.
      const remainingPath = relayMatch ? "/" : (match[2] || "/");

      const host = await getContainerHost(employeeId);
      if (!host) {
        socket.write("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\n\r\nEmployee container not available");
        socket.destroy();
        return;
      }

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

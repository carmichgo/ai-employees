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
import { readFileSync, existsSync } from "fs";
import { eq } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";

const GATEWAY_PORT = 18789;
// The relay listener (port 18792) only binds to 127.0.0.1 inside the container.
// A TCP tunnel inside the container forwards 0.0.0.0:18793 → 127.0.0.1:18792,
// making the relay accessible over the Docker network.
const RELAY_PORT = 18793;

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
  // ── Relay diagnostic: test TCP + WebSocket to relay port (18793) ──
  fastify.get<{ Params: { id: string } }>("/test-relay/:id", async (request, reply) => {
    const { id } = request.params;
    const host = await getContainerHost(id);
    if (!host) return reply.status(404).send({ error: "No container host" });

    const token = await getEmployeeGatewayToken(id);
    const results: Record<string, unknown> = { host, relayPort: RELAY_PORT, gatewayPort: GATEWAY_PORT };

    // 1. Test raw TCP connect to relay port (18793 — tunnel)
    const tcpTest = await new Promise<{ ok: boolean; error?: string; ms: number }>((resolve) => {
      const start = Date.now();
      const t = setTimeout(() => resolve({ ok: false, error: "timeout (5s)", ms: Date.now() - start }), 5000);
      const sock = createConnection({ host, port: RELAY_PORT }, () => {
        clearTimeout(t);
        sock.destroy();
        resolve({ ok: true, ms: Date.now() - start });
      });
      sock.on("error", (err) => {
        clearTimeout(t);
        resolve({ ok: false, error: err.message, ms: Date.now() - start });
      });
    });
    results.tcpConnectToRelay = tcpTest;

    // 2. If TCP works, try a WebSocket upgrade
    if (tcpTest.ok) {
      const wsKey = randomBytes(16).toString("base64");
      // Derive HMAC token the same way the extension does
      const crypto2 = await import("crypto");
      const hmac = crypto2.createHmac("sha256", token || "");
      hmac.update(`openclaw-extension-relay-v1:18792`);
      const derivedToken = hmac.digest("hex");
      const path = `/?token=${encodeURIComponent(derivedToken)}`;

      const wsTest = await new Promise<Record<string, unknown>>((resolve) => {
        const r: Record<string, unknown> = { path, derivedTokenLength: derivedToken.length };
        const t = setTimeout(() => { r.error = "timeout (5s)"; resolve(r); }, 5000);
        const sock = createConnection({ host, port: RELAY_PORT }, () => {
          const upgradeReq = [
            `GET ${path} HTTP/1.1`,
            `Host: ${host}:${RELAY_PORT}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Version: 13`,
            `Sec-WebSocket-Key: ${wsKey}`,
            ``, ``
          ].join("\r\n");
          sock.write(upgradeReq);
        });
        const chunks: Buffer[] = [];
        sock.on("data", (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
          const all = Buffer.concat(chunks);
          const hdr = all.toString("ascii", 0, Math.min(all.length, 4096));
          const hEnd = hdr.indexOf("\r\n\r\n");
          if (hEnd >= 0) {
            clearTimeout(t);
            r.response = hdr.slice(0, hEnd);
            const m = hdr.match(/^HTTP\/[\d.]+ (\d+)/);
            r.statusCode = m ? parseInt(m[1]) : null;
            r.wsUpgraded = r.statusCode === 101;
            // Read a bit more data for any WS frames
            setTimeout(() => {
              if (all.length > hEnd + 4) {
                r.extraBytes = all.length - hEnd - 4;
              }
              sock.destroy();
              resolve(r);
            }, 500);
          }
        });
        sock.on("error", (err) => { clearTimeout(t); r.tcpError = err.message; resolve(r); });
        sock.on("close", () => { clearTimeout(t); resolve(r); });
      });
      results.wsUpgradeToRelay = wsTest;
    }

    // 3. Also test TCP to gateway port for comparison
    const gwTcpTest = await new Promise<{ ok: boolean; error?: string; ms: number }>((resolve) => {
      const start = Date.now();
      const t = setTimeout(() => resolve({ ok: false, error: "timeout (5s)", ms: Date.now() - start }), 5000);
      const sock = createConnection({ host, port: GATEWAY_PORT }, () => {
        clearTimeout(t);
        sock.destroy();
        resolve({ ok: true, ms: Date.now() - start });
      });
      sock.on("error", (err) => {
        clearTimeout(t);
        resolve({ ok: false, error: err.message, ms: Date.now() - start });
      });
    });
    results.tcpConnectToGateway = gwTcpTest;

    // 4. Check if relay-tunnel.cjs is on disk
    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, id),
      columns: { containerName: true },
    });
    if (emp?.containerName) {
      try {
        const { execSync: ex } = await import("child_process");
        // Check if tunnel process is running
        const ps = ex(
          `docker exec ${emp.containerName} sh -c "ps aux 2>/dev/null | grep relay-tunnel || echo NO_MATCH"`,
          { timeout: 5000 }
        ).toString().trim();
        results.tunnelProcess = ps;

        // Check if relay-tunnel.cjs exists
        const fileCheck = ex(
          `docker exec ${emp.containerName} sh -c "ls -la /home/node/.openclaw/relay-tunnel.cjs 2>&1 || echo NOT_FOUND"`,
          { timeout: 5000 }
        ).toString().trim();
        results.tunnelFile = fileCheck;

        // Check what's listening on 18792 and 18793
        const ports = ex(
          `docker exec ${emp.containerName} sh -c "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo NO_SS_OR_NETSTAT"`,
          { timeout: 5000 }
        ).toString().trim();
        results.listeningPorts = ports;
      } catch (err: any) {
        results.dockerExecError = err.message;
      }
    }

    return results;
  });

  // ── WebSocket diagnostic: full gateway handshake test ──
  fastify.get<{ Params: { id: string } }>("/test-ws/:id", async (request, reply) => {
    const { id } = request.params;
    const host = await getContainerHost(id);
    if (!host) return reply.status(404).send({ error: "No container host" });

    const token = await getEmployeeGatewayToken(id);
    const wsKey = randomBytes(16).toString("base64");
    const path = token ? `/?token=${encodeURIComponent(token)}` : "/";

    return new Promise((resolve) => {
      const results: Record<string, unknown> = { host, port: GATEWAY_PORT, path, tokenLength: token?.length };
      const rawChunks: Buffer[] = [];
      const messages: unknown[] = [];
      let resolved = false;
      let headerEnd = -1;
      let handshakeSent = false;

      const finish = () => { if (!resolved) { resolved = true; clearTimeout(timeout); tcpConn.destroy(); results.messages = messages; resolve(reply.send(results)); } };
      const timeout = setTimeout(() => { results.error = "timeout (8s)"; finish(); }, 8000);

      // Encode a WebSocket text frame (server→client frames are unmasked, but client→server must be masked)
      function encodeWsFrame(payload: string): Buffer {
        const data = Buffer.from(payload, "utf-8");
        const mask = randomBytes(4);
        let header: Buffer;
        if (data.length < 126) {
          header = Buffer.alloc(2);
          header[0] = 0x81; // FIN + text
          header[1] = 0x80 | data.length; // masked
        } else {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 0x80 | 126;
          header.writeUInt16BE(data.length, 2);
        }
        const masked = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        return Buffer.concat([header, mask, masked]);
      }

      // Decode WebSocket frames from raw buffer (unmasked, from server)
      function decodeFrames(buf: Buffer): { msg: string; end: number }[] {
        const frames: { msg: string; end: number }[] = [];
        let pos = 0;
        while (pos < buf.length) {
          if (pos + 2 > buf.length) break;
          const opcode = buf[pos] & 0x0f;
          let payloadLen = buf[pos + 1] & 0x7f;
          let offset = pos + 2;
          if (payloadLen === 126) {
            if (offset + 2 > buf.length) break;
            payloadLen = buf.readUInt16BE(offset);
            offset += 2;
          } else if (payloadLen === 127) {
            break; // too large, skip
          }
          if (offset + payloadLen > buf.length) break;
          if (opcode === 0x01) { // text
            frames.push({ msg: buf.slice(offset, offset + payloadLen).toString("utf-8"), end: offset + payloadLen });
          }
          pos = offset + payloadLen;
        }
        return frames;
      }

      function processFrames() {
        const all = Buffer.concat(rawChunks);
        if (headerEnd < 0) return;
        const frameData = all.slice(headerEnd + 4);
        const frames = decodeFrames(frameData);

        for (const f of frames) {
          if (messages.find((m: any) => m?.raw === f.msg)) continue;
          let parsed: any;
          try { parsed = JSON.parse(f.msg); } catch { parsed = f.msg; }
          messages.push({ raw: f.msg, parsed });

          // If this is connect.challenge, send connect request
          if (!handshakeSent && parsed?.type === "event" && parsed?.event === "connect.challenge") {
            handshakeSent = true;
            const connectReq = {
              type: "req",
              id: `test-connect-${Date.now()}`,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: { id: "node-host", version: "1.0.0", platform: "test", mode: "webchat" },
                role: "operator",
                scopes: ["operator.read", "operator.write"],
                caps: [],
                commands: [],
                auth: token ? { token } : undefined,
              },
            };
            results.connectRequestSent = connectReq;
            tcpConn.write(encodeWsFrame(JSON.stringify(connectReq)));
          }

          // If this is a response to our connect, capture and finish
          if (parsed?.type === "res") {
            results.connectResponse = parsed;
            setTimeout(finish, 200); // brief delay to capture any follow-up
          }
        }
      }

      const tcpConn = createConnection({ host, port: GATEWAY_PORT }, () => {
        const upgradeReq = [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${GATEWAY_PORT}`,
          `Origin: http://${host}:${GATEWAY_PORT}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Version: 13`,
          `Sec-WebSocket-Key: ${wsKey}`,
          ``, ``
        ].join("\r\n");
        tcpConn.write(upgradeReq);
      });

      tcpConn.on("data", (chunk: Buffer) => {
        rawChunks.push(Buffer.from(chunk));
        const all = Buffer.concat(rawChunks);
        const hdrStr = all.toString("ascii", 0, Math.min(all.length, 4096));
        const hEnd = hdrStr.indexOf("\r\n\r\n");
        if (hEnd < 0) return;

        if (headerEnd < 0) {
          headerEnd = hEnd;
          results.upgradeResponse = hdrStr.slice(0, hEnd);
          const m = hdrStr.match(/^HTTP\/[\d.]+ (\d+)/);
          results.statusCode = m ? parseInt(m[1]) : null;
          if (results.statusCode !== 101) { finish(); return; }
          results.wsOpen = true;
        }

        processFrames();
      });

      tcpConn.on("error", (err) => { results.connectionError = err.message; finish(); });
      tcpConn.on("close", () => { results.closedByServer = true; finish(); });
    });
  });

  // ── Config diagnostic: read the actual openclaw.json on disk + container uptime ──
  fastify.get<{ Params: { id: string } }>("/test-config/:id", async (request, reply) => {
    const { id } = request.params;
    const configPath = `/opt/ai-employees/openclaw-configs/${id}/openclaw.json`;
    if (!existsSync(configPath)) return reply.status(404).send({ error: "Config file not found", path: configPath });
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);

    // Get container uptime
    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, id),
      columns: { containerName: true },
    });
    let containerStarted: string | null = null;
    if (emp?.containerName) {
      try {
        const { execSync } = await import("child_process");
        containerStarted = execSync(
          `docker inspect --format '{{.State.StartedAt}}' ${emp.containerName}`,
          { timeout: 5000 }
        ).toString().trim();
      } catch {}
    }

    return {
      path: configPath,
      gateway: config.gateway,
      hasAllowedOrigins: content.includes("allowedOrigins"),
      fullConfigLength: content.length,
      containerName: emp?.containerName,
      containerStarted,
    };
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

      // Match /relay/:id/* (extension relay — bridged to gateway port 18789)
      const relayMatch = urlPath.match(/^\/relay\/([^/]+)(\/.*)?$/);
      // Match /gw/:id/* (gateway, port 18789)
      const gwMatch = urlPath.match(/^\/gw\/([^/]+)(\/.*)?$/);

      const match = relayMatch || gwMatch;
      if (!match) return; // Not our request — let Fastify/other handlers deal with it

      // Both relay and gateway connections go to the OpenClaw gateway (18789).
      // The relay port (18792) is internal-only inside the container.
      const port = relayMatch ? RELAY_PORT : GATEWAY_PORT;
      const employeeId = match[1];
      // For relay connections, forward to "/" — the gateway accepts relay
      // WebSocket connections at the root path.
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

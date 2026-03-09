/**
 * Blitzer AI Browser Relay — Service Worker
 *
 * Connects to an employee's OpenClaw gateway CDP relay via WebSocket,
 * receives CDP commands, executes them via chrome.debugger, and sends results back.
 *
 * The dashboard at blitzerai.com sends connection details via chrome.runtime.sendMessage
 * (allowed by externally_connectable in manifest.json).
 */

/** @type {Map<string, { ws: WebSocket, tabId: number|null, employeeName: string }>} */
const connections = new Map(); // employeeId -> connection state

// ── External message handler (from blitzerai.com dashboard) ──────────
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!sender.url) return;
  const allowed = ["https://www.blitzerai.com", "https://blitzerai.com", "http://localhost:3000"];
  if (!allowed.some((u) => sender.url.startsWith(u))) return;

  if (message.action === "connect") {
    handleConnect(message).then(sendResponse);
    return true; // async response
  }

  if (message.action === "disconnect") {
    handleDisconnect(message.employeeId);
    sendResponse({ ok: true });
  }

  if (message.action === "status") {
    sendResponse(getStatus());
  }
});

// ── Internal message handler (from popup) ────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "status") {
    sendResponse(getStatus());
  }
  if (message.action === "disconnect") {
    handleDisconnect(message.employeeId);
    sendResponse({ ok: true });
  }
  if (message.action === "disconnectAll") {
    for (const id of connections.keys()) handleDisconnect(id);
    sendResponse({ ok: true });
  }
});

// ── Connect to employee's CDP relay ──────────────────────────────────
async function handleConnect({ employeeId, employeeName, wsUrl, relayToken }) {
  // Disconnect existing connection for this employee
  if (connections.has(employeeId)) {
    handleDisconnect(employeeId);
  }

  try {
    const ws = new WebSocket(wsUrl);

    const conn = { ws, tabId: null, employeeName: employeeName || "Employee" };
    connections.set(employeeId, conn);

    ws.onopen = () => {
      // Authenticate with the relay token
      ws.send(JSON.stringify({ type: "auth", token: relayToken }));
      updateBadge();
      // Persist connection info for reconnection
      chrome.storage.local.set({
        [`conn_${employeeId}`]: { employeeId, employeeName, wsUrl, relayToken },
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleRelayMessage(employeeId, msg);
      } catch (e) {
        console.error("[relay] Bad message:", e);
      }
    };

    ws.onclose = () => {
      connections.delete(employeeId);
      updateBadge();
      chrome.storage.local.remove(`conn_${employeeId}`);
    };

    ws.onerror = (err) => {
      console.error("[relay] WebSocket error:", err);
      connections.delete(employeeId);
      updateBadge();
    };

    return { ok: true, message: `Connecting to ${employeeName}...` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Handle CDP commands from the relay ───────────────────────────────
async function handleRelayMessage(employeeId, msg) {
  const conn = connections.get(employeeId);
  if (!conn) return;

  // Handle different message types from the CDP relay
  switch (msg.type) {
    case "cdp": {
      // Execute CDP command via chrome.debugger
      const result = await executeCDP(conn, msg);
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type: "cdp_result", id: msg.id, result }));
      }
      break;
    }

    case "navigate": {
      // Open URL in a tab
      const tab = await getOrCreateTab(conn);
      await chrome.tabs.update(tab.id, { url: msg.url });
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type: "navigate_result", id: msg.id, ok: true }));
      }
      break;
    }

    case "screenshot": {
      const tab = await getOrCreateTab(conn);
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: "screenshot_result", id: msg.id, data: dataUrl }));
        }
      } catch (err) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: "screenshot_result", id: msg.id, error: err.message }));
        }
      }
      break;
    }

    case "tabs": {
      const tabs = await chrome.tabs.query({});
      const tabInfo = tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type: "tabs_result", id: msg.id, tabs: tabInfo }));
      }
      break;
    }

    case "ping": {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type: "pong", id: msg.id }));
      }
      break;
    }

    default:
      console.log("[relay] Unknown message type:", msg.type);
  }
}

// ── Execute a CDP command via chrome.debugger ────────────────────────
async function executeCDP(conn, msg) {
  const tab = await getOrCreateTab(conn);

  try {
    // Attach debugger if not already attached
    await chrome.debugger.attach({ tabId: tab.id }, "1.3").catch(() => {
      // Already attached — that's fine
    });

    const result = await chrome.debugger.sendCommand(
      { tabId: tab.id },
      msg.method,
      msg.params || {},
    );
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Tab management ───────────────────────────────────────────────────
async function getOrCreateTab(conn) {
  if (conn.tabId) {
    try {
      const tab = await chrome.tabs.get(conn.tabId);
      if (tab) return tab;
    } catch {
      // Tab was closed
    }
  }
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  conn.tabId = tab.id;
  return tab;
}

// ── Badge/icon updates ──────────────────────────────────────────────
function updateBadge() {
  const count = connections.size;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: count > 0 ? "#22c55e" : "#666" });
}

// ── Status ───────────────────────────────────────────────────────────
function getStatus() {
  const active = [];
  for (const [id, conn] of connections) {
    active.push({
      employeeId: id,
      employeeName: conn.employeeName,
      connected: conn.ws.readyState === WebSocket.OPEN,
      tabId: conn.tabId,
    });
  }
  return { active, count: active.length };
}

// ── Disconnect ───────────────────────────────────────────────────────
function handleDisconnect(employeeId) {
  const conn = connections.get(employeeId);
  if (!conn) return;

  // Detach debugger
  if (conn.tabId) {
    chrome.debugger.detach({ tabId: conn.tabId }).catch(() => {});
  }

  // Close WebSocket
  if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
    conn.ws.close();
  }

  connections.delete(employeeId);
  updateBadge();
  chrome.storage.local.remove(`conn_${employeeId}`);
}

// ── Clean up debugger on tab close ───────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [id, conn] of connections) {
    if (conn.tabId === tabId) {
      conn.tabId = null;
    }
  }
});

// ── Reconnect persisted connections on startup ───────────────────────
chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith("conn_") && value.wsUrl && value.relayToken) {
      handleConnect(value);
    }
  }
});

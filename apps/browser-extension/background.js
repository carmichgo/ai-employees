/**
 * Blitzer AI Browser Relay — Service Worker
 *
 * Fork of OpenClaw's extension, adapted for remote connections via the
 * Blitzer AI dashboard. Speaks the OpenClaw CDP relay protocol
 * (connect.challenge, forwardCDPCommand, forwardCDPEvent).
 *
 * The dashboard at blitzerai.com sends connection details via
 * chrome.runtime.sendMessage (allowed by externally_connectable in manifest.json).
 */

import {
  reconnectDelayMs,
  isRetryableReconnectError,
  isMissingTabError,
  isLastRemainingTab,
} from "./background-utils.js";

const BADGE = {
  on: { text: "ON", color: "#22c55e" },
  off: { text: "", color: "#000000" },
  connecting: { text: "…", color: "#F59E0B" },
  error: { text: "!", color: "#B91C1C" },
};

// ── Per-employee connection state ─────────────────────────────────────
// Each employee gets their own relay WebSocket + set of attached tabs.

/**
 * @typedef {{
 *   ws: WebSocket|null,
 *   wsUrl: string,
 *   relayToken: string,
 *   gatewayToken: string,
 *   employeeName: string,
 *   connectPromise: Promise<void>|null,
 *   connectRequestId: string|null,
 *   reconnectAttempt: number,
 *   reconnectTimer: number|null,
 *   tabs: Map<number, TabState>,
 *   tabBySession: Map<string, number>,
 *   childSessionToTab: Map<string, number>,
 *   pending: Map<number, {resolve: Function, reject: Function}>,
 *   tabOperationLocks: Set<number>,
 *   reattachPending: Set<number>,
 *   nextSession: number,
 * }} EmployeeConnection
 *
 * @typedef {{ state: 'connecting'|'connected', sessionId?: string, targetId?: string, attachOrder?: number }} TabState
 */

/** @type {Map<string, EmployeeConnection>} */
const connections = new Map();

const TAB_VALIDATION_ATTEMPTS = 2;
const TAB_VALIDATION_RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── External message handler (from blitzerai.com dashboard) ──────────
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!sender.url) return;
  const allowed = [
    "https://www.blitzerai.com",
    "https://blitzerai.com",
    "http://localhost:3000",
  ];
  if (!allowed.some((u) => sender.url.startsWith(u))) return;

  if (message.action === "connect") {
    handleDashboardConnect(message).then(sendResponse);
    return true; // async response
  }

  if (message.action === "disconnect") {
    handleDashboardDisconnect(message.employeeId);
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
    handleDashboardDisconnect(message.employeeId);
    sendResponse({ ok: true });
  }
  if (message.action === "disconnectAll") {
    for (const id of connections.keys()) handleDashboardDisconnect(id);
    sendResponse({ ok: true });
  }
});

// ── Dashboard connect: create per-employee relay connection ──────────
async function handleDashboardConnect({ employeeId, employeeName, wsUrl, relayToken, gatewayToken }) {
  // Disconnect existing connection for this employee
  if (connections.has(employeeId)) {
    handleDashboardDisconnect(employeeId);
  }

  /** @type {EmployeeConnection} */
  const conn = {
    ws: null,
    wsUrl,
    relayToken: relayToken || "",
    gatewayToken: gatewayToken || "",
    employeeName: employeeName || "Employee",
    connectPromise: null,
    connectRequestId: null,
    reconnectAttempt: 0,
    reconnectTimer: null,
    tabs: new Map(),
    tabBySession: new Map(),
    childSessionToTab: new Map(),
    pending: new Map(),
    tabOperationLocks: new Set(),
    reattachPending: new Set(),
    nextSession: 1,
  };
  connections.set(employeeId, conn);

  try {
    await ensureRelayConnection(employeeId, conn);
    // Persist connection info for reconnection on browser restart
    chrome.storage.local.set({
      [`conn_${employeeId}`]: { employeeId, employeeName, wsUrl, relayToken, gatewayToken },
    });
    updateGlobalBadge();
    return { ok: true, message: `Connected to ${employeeName}` };
  } catch (err) {
    connections.delete(employeeId);
    updateGlobalBadge();
    return { ok: false, error: err.message };
  }
}

// ── Disconnect employee ──────────────────────────────────────────────
function handleDashboardDisconnect(employeeId) {
  const conn = connections.get(employeeId);
  if (!conn) return;

  // Cancel reconnect
  if (conn.reconnectTimer) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }

  // Detach all debugger sessions
  for (const [tabId, tab] of conn.tabs) {
    if (tab.sessionId) conn.tabBySession.delete(tab.sessionId);
    try {
      chrome.debugger.detach({ tabId }).catch(() => {});
    } catch {}
    setBadge(tabId, "off");
  }
  conn.tabs.clear();

  // Reject pending requests
  for (const [id, p] of conn.pending) {
    p.reject(new Error("Disconnected"));
  }
  conn.pending.clear();

  // Close WebSocket
  if (conn.ws && (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING)) {
    conn.ws.close();
  }

  connections.delete(employeeId);
  chrome.storage.local.remove(`conn_${employeeId}`);
  updateGlobalBadge();
}

// ── Relay WebSocket connection ───────────────────────────────────────
async function ensureRelayConnection(employeeId, conn) {
  if (conn.ws && conn.ws.readyState === WebSocket.OPEN) return;
  if (conn.connectPromise) return await conn.connectPromise;

  conn.connectPromise = (async () => {
    // Build WS URL with relay token as query param (OpenClaw protocol)
    let url = conn.wsUrl;
    if (conn.relayToken && !url.includes("token=")) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}token=${encodeURIComponent(conn.relayToken)}`;
    }

    const ws = new WebSocket(url);
    conn.ws = ws;

    // Bind message handler before open so we don't miss connect.challenge
    ws.onmessage = (event) => {
      onRelayMessage(employeeId, conn, String(event.data || ""));
    };

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WebSocket connect timeout")), 10000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("WebSocket connect failed"));
      };
      ws.onclose = (ev) => {
        clearTimeout(t);
        reject(new Error(`WebSocket closed (${ev.code} ${ev.reason || "no reason"})`));
      };
    });

    // Permanent close/error handlers
    ws.onclose = () => {
      if (ws !== conn.ws) return;
      onRelayClosed(employeeId, conn, "closed");
    };
    ws.onerror = () => {
      if (ws !== conn.ws) return;
      onRelayClosed(employeeId, conn, "error");
    };
  })();

  try {
    await conn.connectPromise;
    conn.reconnectAttempt = 0;
  } finally {
    conn.connectPromise = null;
  }
}

function onRelayClosed(employeeId, conn, reason) {
  conn.ws = null;
  conn.connectRequestId = null;

  for (const [id, p] of conn.pending.entries()) {
    conn.pending.delete(id);
    p.reject(new Error(`Relay disconnected (${reason})`));
  }

  conn.reattachPending.clear();

  for (const [tabId, tab] of conn.tabs.entries()) {
    if (tab.state === "connected") {
      setBadge(tabId, "connecting");
    }
  }

  updateGlobalBadge();
  scheduleReconnect(employeeId, conn);
}

function scheduleReconnect(employeeId, conn) {
  if (conn.reconnectTimer) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }

  const delay = reconnectDelayMs(conn.reconnectAttempt);
  conn.reconnectAttempt++;

  conn.reconnectTimer = setTimeout(async () => {
    conn.reconnectTimer = null;
    if (!connections.has(employeeId)) return; // was disconnected

    try {
      await ensureRelayConnection(employeeId, conn);
      conn.reconnectAttempt = 0;
      await reannounceAttachedTabs(employeeId, conn);
      updateGlobalBadge();
    } catch (err) {
      if (!isRetryableReconnectError(err)) return;
      scheduleReconnect(employeeId, conn);
    }
  }, delay);
}

function sendToRelay(conn, payload) {
  const ws = conn.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("Relay not connected");
  }
  ws.send(JSON.stringify(payload));
}

// ── OpenClaw Gateway Handshake ───────────────────────────────────────
function ensureGatewayHandshakeStarted(conn, payload) {
  if (conn.connectRequestId) return;
  conn.connectRequestId = `ext-connect-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  sendToRelay(conn, {
    type: "req",
    id: conn.connectRequestId,
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "node-host",
        version: "1.0.0",
        platform: "chrome-extension",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      caps: [],
      commands: [],
      auth: conn.gatewayToken ? { token: conn.gatewayToken } : undefined,
    },
  });
}

// ── Relay message handler (OpenClaw protocol) ────────────────────────
function onRelayMessage(employeeId, conn, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }

  // Gateway connect challenge
  if (msg && msg.type === "event" && msg.event === "connect.challenge") {
    try {
      ensureGatewayHandshakeStarted(conn, msg.payload);
    } catch {
      conn.connectRequestId = null;
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close(1008, "gateway connect failed");
      }
    }
    return;
  }

  // Gateway connect response
  if (msg && msg.type === "res" && conn.connectRequestId && msg.id === conn.connectRequestId) {
    conn.connectRequestId = null;
    if (!msg.ok) {
      const detail = msg?.error?.message || msg?.error || "gateway connect failed";
      console.warn("[relay] gateway connect rejected:", detail);
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close(1008, "gateway connect failed");
      }
    }
    return;
  }

  // Ping/pong
  if (msg && msg.method === "ping") {
    try {
      sendToRelay(conn, { method: "pong" });
    } catch {}
    return;
  }

  // Response to our pending requests
  if (msg && typeof msg.id === "number" && (msg.result !== undefined || msg.error !== undefined)) {
    const p = conn.pending.get(msg.id);
    if (!p) return;
    conn.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(String(msg.error)));
    else p.resolve(msg.result);
    return;
  }

  // Forward CDP command from relay → execute via chrome.debugger
  if (msg && typeof msg.id === "number" && msg.method === "forwardCDPCommand") {
    handleForwardCdpCommand(conn, msg)
      .then((result) => sendToRelay(conn, { id: msg.id, result }))
      .catch((err) => sendToRelay(conn, { id: msg.id, error: err instanceof Error ? err.message : String(err) }));
  }
}

// ── Tab management ───────────────────────────────────────────────────

async function validateAttachedTab(tabId) {
  try {
    await chrome.tabs.get(tabId);
  } catch {
    return false;
  }

  for (let attempt = 0; attempt < TAB_VALIDATION_ATTEMPTS; attempt++) {
    try {
      await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: "1",
        returnByValue: true,
      });
      return true;
    } catch (err) {
      if (isMissingTabError(err)) return false;
      if (attempt < TAB_VALIDATION_ATTEMPTS - 1) {
        await sleep(TAB_VALIDATION_RETRY_DELAY_MS);
      }
    }
  }
  return false;
}

async function attachTab(conn, tabId, opts = {}) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  await chrome.debugger.sendCommand(debuggee, "Page.enable").catch(() => {});

  const info = await chrome.debugger.sendCommand(debuggee, "Target.getTargetInfo");
  const targetInfo = info?.targetInfo;
  const targetId = String(targetInfo?.targetId || "").trim();
  if (!targetId) throw new Error("Target.getTargetInfo returned no targetId");

  const sid = conn.nextSession++;
  const sessionId = `cb-tab-${sid}`;

  conn.tabs.set(tabId, { state: "connected", sessionId, targetId, attachOrder: sid });
  conn.tabBySession.set(sessionId, tabId);

  if (!opts.skipAttachedEvent) {
    sendToRelay(conn, {
      method: "forwardCDPEvent",
      params: {
        method: "Target.attachedToTarget",
        params: {
          sessionId,
          targetInfo: { ...targetInfo, attached: true },
          waitingForDebugger: false,
        },
      },
    });
  }

  setBadge(tabId, "on");
  return { sessionId, targetId };
}

async function detachTab(conn, tabId, reason) {
  const tab = conn.tabs.get(tabId);

  // Send detach events for child sessions
  for (const [childSessionId, parentTabId] of conn.childSessionToTab.entries()) {
    if (parentTabId === tabId) {
      try {
        sendToRelay(conn, {
          method: "forwardCDPEvent",
          params: {
            method: "Target.detachedFromTarget",
            params: { sessionId: childSessionId, reason: "parent_detached" },
          },
        });
      } catch {}
      conn.childSessionToTab.delete(childSessionId);
    }
  }

  // Send main session detach event
  if (tab?.sessionId && tab?.targetId) {
    try {
      sendToRelay(conn, {
        method: "forwardCDPEvent",
        params: {
          method: "Target.detachedFromTarget",
          params: { sessionId: tab.sessionId, targetId: tab.targetId, reason },
        },
      });
    } catch {}
  }

  if (tab?.sessionId) conn.tabBySession.delete(tab.sessionId);
  conn.tabs.delete(tabId);

  try {
    await chrome.debugger.detach({ tabId });
  } catch {}

  setBadge(tabId, "off");
}

// ── Re-announce tabs after reconnect ─────────────────────────────────
async function reannounceAttachedTabs(employeeId, conn) {
  for (const [tabId, tab] of conn.tabs.entries()) {
    if (tab.state !== "connected" || !tab.sessionId || !tab.targetId) continue;

    const valid = await validateAttachedTab(tabId);
    if (!valid) {
      conn.tabs.delete(tabId);
      if (tab.sessionId) conn.tabBySession.delete(tab.sessionId);
      setBadge(tabId, "off");
      continue;
    }

    let targetInfo;
    try {
      const info = await chrome.debugger.sendCommand({ tabId }, "Target.getTargetInfo");
      targetInfo = info?.targetInfo;
    } catch {
      targetInfo = tab.targetId ? { targetId: tab.targetId } : undefined;
    }

    try {
      sendToRelay(conn, {
        method: "forwardCDPEvent",
        params: {
          method: "Target.attachedToTarget",
          params: {
            sessionId: tab.sessionId,
            targetInfo: { ...targetInfo, attached: true },
            waitingForDebugger: false,
          },
        },
      });
      setBadge(tabId, "on");
    } catch {
      setBadge(tabId, "connecting");
    }
  }
}

// ── Forward CDP command from relay ───────────────────────────────────
async function handleForwardCdpCommand(conn, msg) {
  const method = String(msg?.params?.method || "").trim();
  const params = msg?.params?.params || undefined;
  const sessionId = typeof msg?.params?.sessionId === "string" ? msg.params.sessionId : undefined;

  const bySession = sessionId ? getTabBySessionId(conn, sessionId) : null;
  const targetId = typeof params?.targetId === "string" ? params.targetId : undefined;
  const tabId =
    bySession?.tabId ||
    (targetId ? getTabByTargetId(conn, targetId) : null) ||
    (() => {
      for (const [id, tab] of conn.tabs.entries()) {
        if (tab.state === "connected") return id;
      }
      return null;
    })();

  if (!tabId) throw new Error(`No attached tab for method ${method}`);

  const debuggee = { tabId };

  // Special method handling (same as OpenClaw)
  if (method === "Runtime.enable") {
    try {
      await chrome.debugger.sendCommand(debuggee, "Runtime.disable");
      await sleep(50);
    } catch {}
    return await chrome.debugger.sendCommand(debuggee, "Runtime.enable", params);
  }

  if (method === "Target.createTarget") {
    const url = typeof params?.url === "string" ? params.url : "about:blank";
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab.id) throw new Error("Failed to create tab");
    await sleep(100);
    const attached = await attachTab(conn, tab.id);
    return { targetId: attached.targetId };
  }

  if (method === "Target.closeTarget") {
    const target = typeof params?.targetId === "string" ? params.targetId : "";
    const toClose = target ? getTabByTargetId(conn, target) : tabId;
    if (!toClose) return { success: false };
    try {
      const allTabs = await chrome.tabs.query({});
      if (isLastRemainingTab(allTabs, toClose)) {
        return { success: false, error: "Cannot close the last tab" };
      }
      await chrome.tabs.remove(toClose);
    } catch {
      return { success: false };
    }
    return { success: true };
  }

  if (method === "Target.activateTarget") {
    const target = typeof params?.targetId === "string" ? params.targetId : "";
    const toActivate = target ? getTabByTargetId(conn, target) : tabId;
    if (!toActivate) return {};
    const tab = await chrome.tabs.get(toActivate).catch(() => null);
    if (!tab) return {};
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
    await chrome.tabs.update(toActivate, { active: true }).catch(() => {});
    return {};
  }

  // Generic CDP command forwarding
  const tabState = conn.tabs.get(tabId);
  const mainSessionId = tabState?.sessionId;
  const debuggerSession =
    sessionId && mainSessionId && sessionId !== mainSessionId
      ? { ...debuggee, sessionId }
      : debuggee;

  return await chrome.debugger.sendCommand(debuggerSession, method, params);
}

function getTabBySessionId(conn, sessionId) {
  const direct = conn.tabBySession.get(sessionId);
  if (direct) return { tabId: direct, kind: "main" };
  const child = conn.childSessionToTab.get(sessionId);
  if (child) return { tabId: child, kind: "child" };
  return null;
}

function getTabByTargetId(conn, targetId) {
  for (const [tabId, tab] of conn.tabs.entries()) {
    if (tab.targetId === targetId) return tabId;
  }
  return null;
}

// ── Badge/icon updates ───────────────────────────────────────────────
function setBadge(tabId, kind) {
  const cfg = BADGE[kind];
  void chrome.action.setBadgeText({ tabId, text: cfg.text });
  void chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color });
  void chrome.action.setBadgeTextColor({ tabId, color: "#FFFFFF" }).catch(() => {});
}

function updateGlobalBadge() {
  const count = connections.size;
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: count > 0 ? "#22c55e" : "#666" });
}

// ── Status ───────────────────────────────────────────────────────────
function getStatus() {
  const active = [];
  for (const [id, conn] of connections) {
    active.push({
      employeeId: id,
      employeeName: conn.employeeName,
      connected: conn.ws?.readyState === WebSocket.OPEN,
      tabCount: conn.tabs.size,
    });
  }
  return { active, count: active.length };
}

// ── Debugger event listeners ─────────────────────────────────────────
// Find which employee connection owns this tab
function findConnForTab(tabId) {
  for (const [employeeId, conn] of connections) {
    if (conn.tabs.has(tabId)) return { employeeId, conn };
  }
  return null;
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId) return;
  const found = findConnForTab(tabId);
  if (!found) return;
  const { conn } = found;
  const tab = conn.tabs.get(tabId);
  if (!tab?.sessionId) return;

  if (method === "Target.attachedToTarget" && params?.sessionId) {
    conn.childSessionToTab.set(String(params.sessionId), tabId);
  }
  if (method === "Target.detachedFromTarget" && params?.sessionId) {
    conn.childSessionToTab.delete(String(params.sessionId));
  }

  try {
    sendToRelay(conn, {
      method: "forwardCDPEvent",
      params: {
        sessionId: source.sessionId || tab.sessionId,
        method,
        params,
      },
    });
  } catch {}
});

chrome.debugger.onDetach.addListener(async (source, reason) => {
  const tabId = source.tabId;
  if (!tabId) return;
  const found = findConnForTab(tabId);
  if (!found) return;
  const { conn } = found;

  // User or DevTools detached — respect intent
  if (reason === "canceled_by_user" || reason === "replaced_with_devtools") {
    void detachTab(conn, tabId, reason);
    return;
  }

  // Check if tab still exists
  let tabInfo;
  try {
    tabInfo = await chrome.tabs.get(tabId);
  } catch {
    void detachTab(conn, tabId, reason);
    return;
  }

  if (tabInfo.url?.startsWith("chrome://") || tabInfo.url?.startsWith("chrome-extension://")) {
    void detachTab(conn, tabId, reason);
    return;
  }

  if (conn.reattachPending.has(tabId)) return;

  const oldTab = conn.tabs.get(tabId);
  const oldSessionId = oldTab?.sessionId;
  const oldTargetId = oldTab?.targetId;

  if (oldSessionId) conn.tabBySession.delete(oldSessionId);
  conn.tabs.delete(tabId);
  for (const [childSessionId, parentTabId] of conn.childSessionToTab.entries()) {
    if (parentTabId === tabId) conn.childSessionToTab.delete(childSessionId);
  }

  if (oldSessionId && oldTargetId) {
    try {
      sendToRelay(conn, {
        method: "forwardCDPEvent",
        params: {
          method: "Target.detachedFromTarget",
          params: { sessionId: oldSessionId, targetId: oldTargetId, reason: "navigation-reattach" },
        },
      });
    } catch {}
  }

  // Re-attach after navigation with staggered retries
  conn.reattachPending.add(tabId);
  setBadge(tabId, "connecting");

  const delays = [200, 500, 1000, 2000, 4000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await sleep(delays[attempt]);
    if (!conn.reattachPending.has(tabId)) return;

    try {
      await chrome.tabs.get(tabId);
    } catch {
      conn.reattachPending.delete(tabId);
      setBadge(tabId, "off");
      return;
    }

    const relayUp = conn.ws && conn.ws.readyState === WebSocket.OPEN;
    try {
      await attachTab(conn, tabId, { skipAttachedEvent: !relayUp });
      conn.reattachPending.delete(tabId);
      if (!relayUp) setBadge(tabId, "connecting");
      return;
    } catch {
      // continue retries
    }
  }

  conn.reattachPending.delete(tabId);
  setBadge(tabId, "off");
});

// ── Tab lifecycle cleanup ────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  const found = findConnForTab(tabId);
  if (!found) return;
  const { conn } = found;

  conn.reattachPending.delete(tabId);
  const tab = conn.tabs.get(tabId);
  if (tab?.sessionId) conn.tabBySession.delete(tab.sessionId);
  conn.tabs.delete(tabId);

  for (const [childSessionId, parentTabId] of conn.childSessionToTab.entries()) {
    if (parentTabId === tabId) conn.childSessionToTab.delete(childSessionId);
  }

  if (tab?.sessionId && tab?.targetId) {
    try {
      sendToRelay(conn, {
        method: "forwardCDPEvent",
        params: {
          method: "Target.detachedFromTarget",
          params: { sessionId: tab.sessionId, targetId: tab.targetId, reason: "tab_closed" },
        },
      });
    } catch {}
  }
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  const found = findConnForTab(removedTabId);
  if (!found) return;
  const { conn } = found;
  const tab = conn.tabs.get(removedTabId);
  if (!tab) return;

  conn.tabs.delete(removedTabId);
  conn.tabs.set(addedTabId, tab);
  if (tab.sessionId) conn.tabBySession.set(tab.sessionId, addedTabId);
  for (const [childSessionId, parentTabId] of conn.childSessionToTab.entries()) {
    if (parentTabId === removedTabId) conn.childSessionToTab.set(childSessionId, addedTabId);
  }
  setBadge(addedTabId, "on");
});

// ── Toolbar click: attach/detach active tab for first connected employee ─
chrome.action.onClicked.addListener(async () => {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = active?.id;
  if (!tabId) return;

  // Check if already attached to any employee
  const found = findConnForTab(tabId);
  if (found) {
    await detachTab(found.conn, tabId, "toggle");
    return;
  }

  // Attach to first connected employee
  for (const [employeeId, conn] of connections) {
    if (conn.ws?.readyState === WebSocket.OPEN) {
      if (conn.tabOperationLocks.has(tabId)) return;
      conn.tabOperationLocks.add(tabId);
      try {
        setBadge(tabId, "connecting");
        await attachTab(conn, tabId);
      } catch (err) {
        setBadge(tabId, "error");
        console.warn("[relay] attach failed:", err.message);
      } finally {
        conn.tabOperationLocks.delete(tabId);
      }
      return;
    }
  }
});

// ── Keepalive alarm ──────────────────────────────────────────────────
chrome.alarms.create("relay-keepalive", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "relay-keepalive") return;

  for (const [employeeId, conn] of connections) {
    // Refresh badges
    for (const [tabId, tab] of conn.tabs) {
      if (tab.state === "connected") {
        setBadge(tabId, conn.ws?.readyState === WebSocket.OPEN ? "on" : "connecting");
      }
    }

    // Trigger reconnect if needed
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
      if (!conn.connectPromise && !conn.reconnectTimer) {
        ensureRelayConnection(employeeId, conn).catch(() => {
          if (!conn.reconnectTimer) scheduleReconnect(employeeId, conn);
        });
      }
    }
  }
});

// ── Reconnect persisted connections on startup ───────────────────────
chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith("conn_") && value.wsUrl) {
      handleDashboardConnect(value);
    }
  }
});

// ── Badge refresh on navigation/activation ───────────────────────────
chrome.webNavigation.onCompleted.addListener(({ tabId, frameId }) => {
  if (frameId !== 0) return;
  const found = findConnForTab(tabId);
  if (!found) return;
  const { conn } = found;
  const tab = conn.tabs.get(tabId);
  if (tab?.state === "connected") {
    setBadge(tabId, conn.ws?.readyState === WebSocket.OPEN ? "on" : "connecting");
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const found = findConnForTab(tabId);
  if (!found) return;
  const { conn } = found;
  const tab = conn.tabs.get(tabId);
  if (tab?.state === "connected") {
    setBadge(tabId, conn.ws?.readyState === WebSocket.OPEN ? "on" : "connecting");
  }
});

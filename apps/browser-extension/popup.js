/**
 * Popup script — shows active relay connections and allows disconnect.
 */

function render(status) {
  const content = document.getElementById("content");
  const footer = document.getElementById("footer");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const shareBar = document.getElementById("shareBar");
  const shareStatus = document.getElementById("shareStatus");

  // Show share button when at least one employee is connected
  const hasConnected = status && status.active && status.active.some((c) => c.connected);
  shareBar.style.display = hasConnected ? "block" : "none";
  shareStatus.textContent = "";
  const shareBtn = document.getElementById("shareTab");
  shareBtn.innerHTML = '<span class="icon">+</span> Share this tab';
  shareBtn.disabled = false;

  if (!status || status.count === 0) {
    statusDot.className = "dot gray";
    statusText.textContent = "No connections";
    footer.style.display = "none";
    content.innerHTML = `
      <div class="empty">
        <p>No employees connected</p>
        <a href="https://www.blitzerai.com/dashboard" target="_blank">
          Go to Dashboard to connect →
        </a>
      </div>
    `;
    return;
  }

  statusDot.className = "dot green";
  statusText.textContent = `${status.count} connected`;
  footer.style.display = "flex";

  content.innerHTML = `
    <div class="connections">
      ${status.active
        .map(
          (c) => `
        <div class="conn-item">
          <div>
            <div class="conn-name">${escapeHtml(c.employeeName)}</div>
            <div class="conn-status ${c.connected ? "" : "error"}">
              ${c.connected ? `Connected · ${c.tabCount || 0} tab${c.tabCount === 1 ? "" : "s"}` : "Reconnecting..."}
            </div>
          </div>
          <button class="btn-disconnect" data-id="${c.employeeId}">Disconnect</button>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  // Bind disconnect buttons
  content.querySelectorAll(".btn-disconnect").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "disconnect", employeeId: btn.dataset.id }, () => {
        refresh();
      });
    });
  });
}

function refresh() {
  chrome.runtime.sendMessage({ action: "status" }, (status) => {
    render(status);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  refresh();

  document.getElementById("disconnectAll").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "disconnectAll" }, () => {
      refresh();
    });
  });

  document.getElementById("shareTab").addEventListener("click", async () => {
    const btn = document.getElementById("shareTab");
    const status = document.getElementById("shareStatus");
    btn.disabled = true;
    btn.textContent = "Attaching...";
    status.textContent = "";

    chrome.runtime.sendMessage({ action: "attachActiveTab" }, (res) => {
      if (res && res.ok) {
        status.textContent = "Tab shared successfully";
        status.style.color = "#22c55e";
        btn.innerHTML = '<span class="icon">✓</span> Tab shared';
        setTimeout(() => refresh(), 1000);
      } else {
        status.textContent = res?.error || "Failed to attach tab";
        status.style.color = "#ef4444";
        btn.innerHTML = '<span class="icon">+</span> Share this tab';
        btn.disabled = false;
      }
    });
  });
});

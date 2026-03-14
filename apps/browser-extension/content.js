// Content script injected into Blitzer AI dashboard pages.
// Exposes the extension ID so the dashboard can auto-detect it
// without requiring the user to paste it manually.

(() => {
  // Set a global variable the dashboard checks
  window.__BLITZER_EXTENSION_ID = chrome.runtime.id;

  // Also respond to custom events in case the page loads after this script
  window.addEventListener("blitzer-extension-ping", () => {
    window.__BLITZER_EXTENSION_ID = chrome.runtime.id;
    window.dispatchEvent(
      new CustomEvent("blitzer-extension-pong", {
        detail: { extensionId: chrome.runtime.id },
      })
    );
  });
})();

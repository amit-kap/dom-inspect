// Bridge between background service worker and injected overlay.
// Runs in isolated world. Relays messages via CustomEvents on document.

function injectOverlay(callback) {
  if (document.documentElement.hasAttribute('data-dom-inspect-injected')) {
    if (callback) callback();
    return;
  }
  document.documentElement.setAttribute('data-dom-inspect-injected', 'true');
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => {
    script.remove();
    if (callback) callback();
  };
  document.documentElement.appendChild(script);
}

function sendToOverlay(action) {
  document.dispatchEvent(new CustomEvent('dom-inspect-' + action));
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'activate') {
    injectOverlay(() => sendToOverlay('activate'));
  } else if (msg.action === 'deactivate') {
    sendToOverlay('deactivate');
  }
});

// On page load, check if this origin is enabled
chrome.storage.local.get('enabledOrigins', ({ enabledOrigins = {} }) => {
  if (enabledOrigins[location.origin]) {
    injectOverlay(() => sendToOverlay('activate'));
  }
});

// Manage per-origin enabled state and icon appearance.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  const origin = new URL(tab.url).origin;
  const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
  const isEnabled = !enabledOrigins[origin];

  if (isEnabled) {
    enabledOrigins[origin] = true;
  } else {
    delete enabledOrigins[origin];
  }
  await chrome.storage.local.set({ enabledOrigins });

  updateIcon(tab.id, isEnabled);

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: isEnabled ? 'activate' : 'deactivate'
    });
  } catch (e) {
    // Content script not yet loaded — it will check storage on init
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    const origin = new URL(tab.url).origin;
    const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
    updateIcon(tabId, !!enabledOrigins[origin]);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || tab.url.startsWith('chrome://')) return;
  const origin = new URL(tab.url).origin;
  const { enabledOrigins = {} } = await chrome.storage.local.get('enabledOrigins');
  updateIcon(tabId, !!enabledOrigins[origin]);
});

function updateIcon(tabId, isEnabled) {
  const suffix = isEnabled ? '-active' : '';
  chrome.action.setIcon({
    tabId,
    path: {
      16: `icons/icon-16${suffix}.png`,
      32: `icons/icon-32${suffix}.png`,
      48: `icons/icon-48${suffix}.png`,
      128: `icons/icon-128${suffix}.png`,
    }
  });
  chrome.action.setTitle({
    tabId,
    title: isEnabled ? 'DOM Inspect (active)' : 'DOM Inspect'
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "INJECT_CONTENT_SCRIPT") return false;

  const tabId = sender.tab?.id ?? message.tabId;
  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "No active tab." });
    return true;
  }

  chrome.scripting
    .executeScript({
      target: { tabId },
      files: ["assets/content.js"]
    })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to inject Layouter." }));

  return true;
});

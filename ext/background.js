// ── Aura Music Control v2 — background ──

const URLS = [
  "*://localhost/*",
  "*://webmusic.cc.cd/*",
  "*://killmyworld.github.io/*",
];

// Direct handler injected when content script unreachable
const DIRECT_HANDLER = (command) => {
  const audio = document.querySelector("audio");
  if (!audio) return;
  if (command === "play-pause") {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  const keys = {
    "prev-track": { key: "ArrowLeft", code: "ArrowLeft", ctrlKey: true },
    "next-track": { key: "ArrowRight", code: "ArrowRight", ctrlKey: true },
  };
  const k = keys[command];
  if (k) {
    const e = new KeyboardEvent("keydown", { ...k, shiftKey: false, metaKey: false, altKey: false, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
  }
};

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ url: URLS });
  if (!tabs.length) return;

  const tabId = tabs[0].id;

  // Try content script message first
  try {
    await chrome.tabs.sendMessage(tabId, { command });
  } catch {
    // Content script not loaded — inject handler directly
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: DIRECT_HANDLER,
        args: [command],
      });
    } catch {}
  }
});

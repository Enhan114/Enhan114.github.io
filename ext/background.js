// ── Aura Music Control — background ──
// Global shortcut → inject handler directly into Aura tab

const URLS = [
  "*://localhost/*",
  "*://webmusic.cc.cd/*",
  "*://killmyworld.github.io/*",
];

const HANDLER_CODE = (command) => {
  const audio = document.querySelector("audio");
  if (command === "play-pause" && audio) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  // Prev/Next: dispatch keyboard events for the app's shortcut system
  const keys = {
    "prev-track": { key: "ArrowLeft",  code: "ArrowLeft",  ctrlKey: true  },
    "next-track": { key: "ArrowRight", code: "ArrowRight", ctrlKey: true  },
  };
  const k = keys[command];
  if (k) {
    const evt = new KeyboardEvent("keydown", { ...k, shiftKey: false, metaKey: false, altKey: false, bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
  }
};

chrome.commands.onCommand.addListener(async (command) => {
  console.log("[AuraExt] command:", command);
  const tabs = await chrome.tabs.query({ url: URLS });
  if (!tabs.length) { console.log("[AuraExt] no Aura tab found"); return; }

  const tabId = tabs[0].id;
  // Try message first
  try {
    await chrome.tabs.sendMessage(tabId, { command });
    console.log("[AuraExt] message sent OK");
  } catch {
    // Content script not ready — inject directly
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: HANDLER_CODE,
        args: [command],
      });
      console.log("[AuraExt] injected directly");
    } catch (e) {
      console.warn("[AuraExt] injection failed:", e);
    }
  }
});

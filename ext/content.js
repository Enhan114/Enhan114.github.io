// ── Aura Music Control — content script ──

console.log("[AuraExt] loaded for", location.href);

function fireKey(key, code, ctrl, shift) {
  const evt = new KeyboardEvent("keydown", {
    key, code, ctrlKey: !!ctrl, shiftKey: !!shift,
    metaKey: false, altKey: false, bubbles: true, cancelable: true,
  });
  window.dispatchEvent(evt);
  document.dispatchEvent(evt);
}

const handlers = {
  "prev-track": () => fireKey("ArrowLeft", "ArrowLeft", true, false),
  "play-pause": () => {
    const a = document.querySelector("audio");
    if (a) { a.paused ? a.play() : a.pause(); }
    fireKey(" ", "Space", false, false);
  },
  "next-track": () => fireKey("ArrowRight", "ArrowRight", true, false),
};

chrome.runtime.onMessage.addListener((msg) => {
  const h = handlers[msg.command];
  if (h) h();
});

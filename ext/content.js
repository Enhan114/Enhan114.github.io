// ── Aura Music Control — content script ──
// Dispatches native KeyboardEvents on the document so the
// app's keyboard shortcut system picks them up naturally.

console.log("[AuraExt] content script loaded for", location.href);

function fireKey(key, code, ctrl, shift) {
  console.log("[AuraExt] fireKey:", { key, code, ctrl, shift });
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: key,
    code: code,
    ctrlKey: !!ctrl,
    shiftKey: !!shift,
    metaKey: false,
    altKey: false,
    bubbles: true,
    cancelable: true,
  }));
  // Also dispatch on window directly for robustness
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key: key,
    code: code,
    ctrlKey: !!ctrl,
    shiftKey: !!shift,
    metaKey: false,
    altKey: false,
    bubbles: true,
    cancelable: true,
  }));
}

const handlers = {
  "prev-track":  () => fireKey("ArrowLeft",  "ArrowLeft",  true,  false), // Ctrl+←
  "play-pause":  () => fireKey(" ",          "Space",      false, false), // Space
  "next-track":  () => fireKey("ArrowRight", "ArrowRight", true,  false), // Ctrl+→
};

chrome.runtime.onMessage.addListener(function(msg) {
  console.log("[AuraExt] received command:", msg.command);
  var handler = handlers[msg.command];
  if (handler) handler();
});

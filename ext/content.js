// ── Aura Music Control — content script ──

console.log("[AuraExt] content script loaded for", location.href);

// Find the audio element and control it directly
function getAudio() {
  return document.querySelector("audio");
}

function fireKey(key, code, ctrl, shift) {
  var evt = new KeyboardEvent("keydown", {
    key: key, code: code,
    ctrlKey: !!ctrl, shiftKey: !!shift,
    metaKey: false, altKey: false,
    bubbles: true, cancelable: true,
  });
  // Dispatch on window and document for maximum compatibility
  window.dispatchEvent(evt);
  document.dispatchEvent(evt);
}

var handlers = {
  "prev-track":  function() { fireKey("ArrowLeft",  "ArrowLeft",  true,  false); },
  "play-pause":  function() {
    var audio = getAudio();
    if (audio) {
      if (audio.paused) { audio.play(); } else { audio.pause(); }
    }
    // Also fire Space for app-level play/pause handling
    fireKey(" ", "Space", false, false);
  },
  "next-track":  function() { fireKey("ArrowRight", "ArrowRight", true,  false); },
};

chrome.runtime.onMessage.addListener(function(msg) {
  console.log("[AuraExt] received:", msg.command);
  var h = handlers[msg.command];
  if (h) { h(); console.log("[AuraExt] executed:", msg.command); }
  else console.warn("[AuraExt] unknown command:", msg.command);
});

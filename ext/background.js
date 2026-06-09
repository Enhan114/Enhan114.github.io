// ── Aura Music Control — background ──
// Global shortcut → find Aura tab → send message

chrome.commands.onCommand.addListener(async function(command) {
  console.log("[AuraExt] command received:", command);

  // Try localhost first (dev), then production
  var tabs = await chrome.tabs.query({
    url: [
      "*://localhost/*",
      "*://webmusic.cc.cd/*",
      "*://killmyworld.github.io/*",
      "*://killmywor.gitee.io/*"
    ]
  });
  console.log("[AuraExt] found tabs:", tabs.length);
  if (!tabs.length) return;

  try {
    await chrome.tabs.sendMessage(tabs[0].id, { command: command });
    console.log("[AuraExt] message sent to tab", tabs[0].id);
  } catch (e) {
    console.warn("[AuraExt] sendMessage failed:", e);
  }
});

// ── Aura Music Control — background ──
// Global shortcut → find Aura tab → send message

chrome.commands.onCommand.addListener(async function(command) {
  var tabs = await chrome.tabs.query({
    url: [
      "*://webmusic.cc.cd/*",
      "*://killmyworld.github.io/*",
      "*://killmywor.gitee.io/*",
      "*://localhost/*"
    ]
  });
  if (!tabs.length) return;

  try {
    await chrome.tabs.sendMessage(tabs[0].id, { command: command });
  } catch (_) {}
});

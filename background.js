// Toolbar icon opens the side panel; the right-click menu sends selected text to it.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: 'read-aloud', title: '用 Read Aloud 朗读选中文字', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'read-aloud') return;
  chrome.sidePanel.open({ windowId: tab.windowId });   // must run inside the click, before any await
  chrome.storage.session.set({ pending: { text: info.selectionText, ts: Date.now() } });
});

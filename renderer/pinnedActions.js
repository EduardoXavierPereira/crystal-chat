export function createPinnedActions({
  db,
  els,
  state,
  saveChat,
  saveUIState,
  applySidebarSelection,
  renderChatsUI,
  renderActiveChatUI
}) {
  async function togglePinned(id) {
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;
    if (chat.pinnedAt || chat.favoriteAt) {
      delete chat.pinnedAt;
      delete chat.favoriteAt;
    } else {
      chat.pinnedAt = Date.now();
    }
    await saveChat(db, chat);
    renderChatsUI();
    renderActiveChatUI();
  }

  return {
    togglePinned
  };
}

export function createPinnedActions({
  db,
  els,
  state,
  saveChat,
  renderPinnedDropdown,
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

  function getPinnedChats() {
    return (state.chats || [])
      .filter((c) => !c.deletedAt && !!c.pinnedAt)
      .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  }

  function renderPinnedDropdownUI() {
    if (els.pinnedDropdownEl) {
      els.pinnedDropdownEl.classList.toggle('hidden', !state.pinnedOpen);
    }
    if (!state.pinnedOpen) return;

    renderPinnedDropdown({
      els,
      pinnedChats: getPinnedChats(),
      onOpenChat: (id) => {
        applySidebarSelection({ kind: 'chat', id });
        els.promptInput?.focus();
      }
    });
  }

  function togglePinnedOpen() {
    state.pinnedOpen = !state.pinnedOpen;
    saveUIState(state);
    renderChatsUI();
  }

  return {
    togglePinned,
    renderPinnedDropdownUI,
    togglePinnedOpen
  };
}

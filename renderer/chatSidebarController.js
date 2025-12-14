export function createChatSidebarController({
  els,
  state,
  saveUIState,
  setSidebarSelection,
  renderChats,
  renderActiveChatUI,
  commitRename,
  getTrashActions,
  getPinnedActions
}) {
  function applySidebarSelection(next) {
    setSidebarSelection(state, next);
    saveUIState(state);
    renderChatsUI();
    renderActiveChatUI();
  }

  function setActiveChat(id) {
    applySidebarSelection({ kind: 'chat', id });
  }

  function renderChatsUI() {
    renderChats({
      els,
      state,
      onSetActiveChat: setActiveChat,
      onStartRename: {
        begin: (id) => {
          state.renamingId = id;
          renderChatsUI();
        },
        cancel: async () => {
          state.renamingId = null;
          renderChatsUI();
        },
        commit: async (id, title) => {
          await commitRename(id, title);
        }
      },
      onTrashChat: (id) => getTrashActions()?.handleTrashChat(id),
      onTogglePinned: (id) => getPinnedActions()?.togglePinned(id)
    });

    getPinnedActions()?.renderPinnedDropdownUI();
  }

  return {
    applySidebarSelection,
    renderChatsUI
  };
}

export function createChatSidebarController({
  els,
  state,
  saveUIState,
  setSidebarSelection,
  renderChats,
  renderActiveChatUI,
  commitRename,
  getTrashActions,
  getPinnedActions,
  getFoldersActions,
  focusDockView
}) {
  function applySidebarSelection(next) {
    setSidebarSelection(state, next);
    saveUIState(state);
    renderChatsUI();
    renderActiveChatUI();

    if (next?.kind === 'chat') {
      focusDockView?.('chat');
    }
  }

  function setActiveChat(id) {
    applySidebarSelection({ kind: 'chat', id });
  }

  function renderChatsUI() {
    const foldersActions = getFoldersActions?.();

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
      onTogglePinned: (id) => getPinnedActions()?.togglePinned(id),
      onDragStartChat: (e, id) => foldersActions?.onDragStartFromChatList?.(e, id)
    });

    getPinnedActions()?.renderPinnedDropdownUI();
    foldersActions?.renderFoldersUI?.();
  }

  return {
    applySidebarSelection,
    renderChatsUI
  };
}

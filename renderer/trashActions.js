export function createTrashActions({
  db,
  els,
  state,
  trashRetentionMs,
  saveUIState,
  renderChatsUI,
  renderActiveChatUI,
  renderTrash,
  openConfirm,
  dbApi
}) {
  const {
    loadChats,
    saveChat,
    loadTrashedChats,
    deleteChat,
    purgeExpiredTrashedChats
  } = dbApi;

  async function renderTrashUI() {
    const trashed = await loadTrashedChats(db);
    renderTrash({
      els,
      trashedChats: trashed,
      trashQuery: state.trashQuery,
      onRestore: restoreChat,
      onDelete: deleteChatPermanently
    });
  }

  async function handleTrashChat(id) {
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;
    chat.deletedAt = Date.now();
    await saveChat(db, chat);
    state.chats = state.chats.filter((c) => c.id !== id);
    if (state.renamingId === id) state.renamingId = null;
    if (state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === id) {
      state.sidebarSelection = { kind: 'chat', id: null };
      saveUIState(state);
    }
    renderChatsUI();
    renderActiveChatUI();
    await renderTrashUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'trashed' } }));
    } catch {
      // ignore
    }
  }

  async function restoreChat(id) {
    const trashed = await loadTrashedChats(db);
    const chat = trashed.find((c) => c.id === id);
    if (!chat) return;
    delete chat.deletedAt;
    await saveChat(db, chat);
    await purgeExpiredTrashedChats(db, trashRetentionMs);
    state.chats = await loadChats(db);
    renderChatsUI();
    await renderTrashUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'restored' } }));
    } catch {
      // ignore
    }
  }

  async function deleteChatPermanently(id) {
    await deleteChat(db, id);
    await purgeExpiredTrashedChats(db, trashRetentionMs);
    await renderTrashUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'permanent-delete' } }));
    } catch {
      // ignore
    }
  }

  async function restoreAllTrashedChats() {
    const trashed = await loadTrashedChats(db);
    if (trashed.length === 0) return;
    await Promise.all(
      trashed.map(async (chat) => {
        delete chat.deletedAt;
        await saveChat(db, chat);
      })
    );
    state.chats = await loadChats(db);
    renderChatsUI();
    await renderTrashUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'restore-all' } }));
    } catch {
      // ignore
    }
  }

  async function deleteAllTrashedChatsPermanently() {
    const trashed = await loadTrashedChats(db);
    if (trashed.length === 0) return;
    await Promise.all(trashed.map((c) => deleteChat(db, c.id)));
    await renderTrashUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'delete-all' } }));
    } catch {
      // ignore
    }
  }

  async function requestDeleteAllTrashed() {
    const trashed = await loadTrashedChats(db);
    if (trashed.length === 0) return;
    if (trashed.length === 1) {
      await deleteAllTrashedChatsPermanently();
      return;
    }
    openConfirm(
      els,
      `Delete ${trashed.length} chats permanently? This cannot be undone.`,
      async () => {
        await deleteAllTrashedChatsPermanently();
      },
      (v) => (state.confirmAction = v)
    );
  }

  return {
    renderTrashUI,
    handleTrashChat,
    restoreChat,
    deleteChatPermanently,
    restoreAllTrashedChats,
    requestDeleteAllTrashed
  };
}

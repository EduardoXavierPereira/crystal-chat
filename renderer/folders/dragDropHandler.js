/**
 * Drag-drop handler for folders and chats
 * Manages drop payload parsing and folder/chat reorganization
 */

const DRAG_MIME = 'application/x-crystal-chat-dnd';

/**
 * Create a drag-drop handler for folder operations
 * @param {Object} deps - Dependencies {state, saveUIState, renderChatsUI, folderTreeUtils}
 * @returns {Object} API {onDragStartChat, onDragStartFolder, handleDropOnFolder, handleDropOnRoot}
 */
export function createDragDropHandler({ state, saveUIState, renderChatsUI, folderTreeUtils }) {
  const { findFolder, removeFolderById, removeChatFromAllFolders, isDescendantFolderId } = folderTreeUtils;

  /**
   * Extract drag payload from dataTransfer
   * @param {DataTransfer} dataTransfer
   * @returns {Object|null} Payload {kind, id} or null
   */
  function parseDragPayload(dataTransfer) {
    let raw = '';
    try {
      raw = dataTransfer.getData(DRAG_MIME);
    } catch {
      raw = '';
    }
    if (!raw) {
      try {
        raw = dataTransfer.getData('text/plain');
      } catch {
        raw = '';
      }
    }
    if (!raw) return null;

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    if (!payload || !payload.kind || !payload.id) return null;
    return payload;
  }

  /**
   * Handle chat drop - move chat to target folder or root
   */
  function moveChatToTarget(chatId, targetFolderId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;

    removeChatFromAllFolders(state.folders, id);

    if (targetFolderId) {
      // Move to folder
      removeChatFromRootList(id);
      const target = findFolder(state.folders, targetFolderId);
      if (!target) return;
      if (!Array.isArray(target.chatIds)) target.chatIds = [];
      const exists = target.chatIds.some((x) => (x || '').toString().trim() === id);
      if (!exists) target.chatIds.push(id);
      target.open = true;
    } else {
      // Move to root
      addChatToRootList(id);
    }
  }

  /**
   * Handle folder drop - move folder to target or root
   */
  function moveFolderToTarget(movingId, targetFolderId) {
    if (targetFolderId && movingId === targetFolderId) return;

    const movingFolder = removeFolderById(state.folders, movingId);
    if (!movingFolder) return;

    if (targetFolderId) {
      const target = findFolder(state.folders, targetFolderId);
      if (!target) {
        // Target not found, move to root
        state.folders.push(movingFolder);
      } else {
        // Check if moving folder is ancestor of target
        if (isDescendantFolderId(movingFolder, targetFolderId)) {
          // Can't nest into own children, move to root
          state.folders.push(movingFolder);
        } else {
          // Add to target folder
          if (!Array.isArray(target.folders)) target.folders = [];
          target.folders.push(movingFolder);
          target.open = true;
        }
      }
    } else {
      // Move to root
      state.folders.push(movingFolder);
    }
  }

  /**
   * Helper: Add chat to root list (avoid duplicates)
   */
  function addChatToRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    const exists = state.rootChatIds.some((x) => (x || '').toString().trim() === id);
    if (!exists) state.rootChatIds.push(id);
  }

  /**
   * Helper: Remove chat from root list
   */
  function removeChatFromRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    for (let i = state.rootChatIds.length - 1; i >= 0; i--) {
      if ((state.rootChatIds[i] || '').toString().trim() === id) state.rootChatIds.splice(i, 1);
    }
  }

  return {
    DRAG_MIME,

    /**
     * Handle drag start for chat
     */
    onDragStartChat(e, chatId) {
      try {
        const payload = JSON.stringify({ kind: 'chat', id: chatId });
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData(DRAG_MIME, payload);
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    },

    /**
     * Handle drag start for folder
     */
    onDragStartFolder(e, folderId) {
      try {
        const payload = JSON.stringify({ kind: 'folder', id: folderId });
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData(DRAG_MIME, payload);
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    },

    /**
     * Handle drop on folder
     */
    handleDropOnFolder(e, targetFolderId) {
      if (!targetFolderId) return;
      const payload = parseDragPayload(e.dataTransfer);
      if (!payload || !payload.kind || !payload.id) return;

      if (payload.kind === 'chat') {
        moveChatToTarget(payload.id, targetFolderId);
      } else if (payload.kind === 'folder') {
        moveFolderToTarget(payload.id, targetFolderId);
      }

      saveUIState(state);
      renderChatsUI();
    },

    /**
     * Handle drop on root (no folder)
     */
    handleDropOnRoot(e) {
      const payload = parseDragPayload(e.dataTransfer);
      if (!payload || !payload.kind || !payload.id) return;

      if (payload.kind === 'chat') {
        moveChatToTarget(payload.id, null);
      } else if (payload.kind === 'folder') {
        moveFolderToTarget(payload.id, null);
      }

      saveUIState(state);
      renderChatsUI();
    }
  };
}

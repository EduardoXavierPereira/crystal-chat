import { renderFoldersTree } from './folders.js';

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `f_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

function visitFolders(folders, fn) {
  (folders || []).forEach((f) => {
    fn(f);
    visitFolders(f.folders || [], fn);
  });
}

function findFolder(folders, id) {
  let found = null;
  visitFolders(folders, (f) => {
    if (found) return;
    if (f.id === id) found = f;
  });
  return found;
}

function removeFolderById(folders, id) {
  if (!Array.isArray(folders)) return null;
  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    if (f?.id === id) {
      folders.splice(i, 1);
      return f;
    }
    const removed = removeFolderById(f?.folders || [], id);
    if (removed) return removed;
  }
  return null;
}

function isDescendantFolderId(rootFolder, maybeChildId) {
  if (!rootFolder || !maybeChildId) return false;
  let hit = false;
  visitFolders(rootFolder.folders || [], (f) => {
    if (f.id === maybeChildId) hit = true;
  });
  return hit;
}

function removeChatFromAllFolders(folders, chatId) {
  visitFolders(folders, (f) => {
    if (!Array.isArray(f.chatIds)) return;
    const idx = f.chatIds.indexOf(chatId);
    if (idx >= 0) f.chatIds.splice(idx, 1);
  });
}

function removeChatFromFolderById(folders, folderId, chatId) {
  const folder = findFolder(folders, folderId);
  if (!folder || !Array.isArray(folder.chatIds)) return false;
  const idx = folder.chatIds.indexOf(chatId);
  if (idx < 0) return false;
  folder.chatIds.splice(idx, 1);
  return true;
}

function getAllFolderChatIds(folders) {
  const out = new Set();
  visitFolders(folders, (f) => {
    (f.chatIds || []).forEach((id) => out.add(id));
  });
  return out;
}

export function createFoldersActions({ els, state, saveUIState, renderChatsUI, applySidebarSelection }) {
  const DRAG_MIME = 'application/x-crystal-chat-dnd';

  let folderCreateOpen = false;

  function ensureFoldersInitialized() {
    if (!Array.isArray(state.folders)) state.folders = [];
  }

  function createFolderAtRoot(name) {
    ensureFoldersInitialized();
    state.folders.push({ id: newId(), name: (name || 'Folder').toString(), open: true, folders: [], chatIds: [] });
    saveUIState(state);
    renderChatsUI();
  }

  function requestCreateFolder() {
    if (!els.folderCreateModalEl || !els.folderCreateInputEl) return;
    folderCreateOpen = true;
    els.folderCreateInputEl.value = '';
    els.folderCreateModalEl.classList.remove('hidden');
    requestAnimationFrame(() => els.folderCreateInputEl?.focus());
  }

  function closeCreateFolderModal() {
    folderCreateOpen = false;
    els.folderCreateModalEl?.classList.add('hidden');
  }

  function commitCreateFolderFromModal() {
    if (!folderCreateOpen) return;
    const name = (els.folderCreateInputEl?.value || '').toString().trim();
    if (!name) return;
    closeCreateFolderModal();
    createFolderAtRoot(name);
  }

  function toggleFolderOpen(id) {
    ensureFoldersInitialized();
    const f = findFolder(state.folders, id);
    if (!f) return;
    f.open = !f.open;
    saveUIState(state);
    renderChatsUI();
  }

  function renderFoldersUI() {
    ensureFoldersInitialized();

    const activeChatId = state.sidebarSelection?.kind === 'chat' ? state.sidebarSelection.id : null;

    renderFoldersTree({
      els,
      state,
      folders: state.folders,
      onToggleOpen: toggleFolderOpen,
      onOpenChat: (chatId) => {
        applySidebarSelection?.({ kind: 'chat', id: chatId });
        els.promptInput?.focus();
      },
      onDragStartChat: (e, chatId) => {
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
      onDragStartFolder: (e, folderId) => {
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
      onRemoveChatFromFolder: (folderId, chatId) => {
        const ok = removeChatFromFolderById(state.folders, folderId, chatId);
        if (!ok) return;
        saveUIState(state);
        renderChatsUI();
      },
      onDropOnFolder: (e, targetFolderId) => {
        handleDrop(e, targetFolderId);
      },
      onDropOnRoot: (e) => {
        handleDrop(e, null);
      },
      activeChatId
    });
  }

  function handleDrop(e, targetFolderId) {
    ensureFoldersInitialized();

    let raw = '';
    try {
      raw = e.dataTransfer.getData(DRAG_MIME);
    } catch {
      raw = '';
    }
    if (!raw) {
      try {
        raw = e.dataTransfer.getData('text/plain');
      } catch {
        raw = '';
      }
    }
    if (!raw) return;

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!payload || !payload.kind || !payload.id) return;

    if (payload.kind === 'chat') {
      const chatId = payload.id;
      removeChatFromAllFolders(state.folders, chatId);
      if (targetFolderId) {
        const target = findFolder(state.folders, targetFolderId);
        if (!target) return;
        if (!Array.isArray(target.chatIds)) target.chatIds = [];
        target.chatIds.push(chatId);
        target.open = true;
      }
      saveUIState(state);
      renderChatsUI();
      return;
    }

    if (payload.kind === 'folder') {
      const movingId = payload.id;
      if (targetFolderId && movingId === targetFolderId) return;

      const movingFolder = removeFolderById(state.folders, movingId);
      if (!movingFolder) return;

      if (targetFolderId) {
        const target = findFolder(state.folders, targetFolderId);
        if (!target) {
          state.folders.push(movingFolder);
        } else {
          if (isDescendantFolderId(movingFolder, targetFolderId)) {
            state.folders.push(movingFolder);
          } else {
            if (!Array.isArray(target.folders)) target.folders = [];
            target.folders.push(movingFolder);
            target.open = true;
          }
        }
      } else {
        state.folders.push(movingFolder);
      }

      saveUIState(state);
      renderChatsUI();
    }
  }

  function onDragStartFromChatList(e, chatId) {
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
  }

  function getHiddenChatIdSet() {
    ensureFoldersInitialized();
    return getAllFolderChatIds(state.folders);
  }

  function attachBindings() {
    els.foldersNewBtn?.addEventListener('click', () => {
      requestCreateFolder();
    });

    els.folderCreateCancelBtn?.addEventListener('click', () => {
      closeCreateFolderModal();
    });

    els.folderCreateOkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      commitCreateFolderFromModal();
    });

    els.folderCreateModalEl?.addEventListener('click', (e) => {
      if (e.target === els.folderCreateModalEl) closeCreateFolderModal();
    });

    els.folderCreateInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCreateFolderFromModal();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCreateFolderModal();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && folderCreateOpen) {
        e.preventDefault();
        closeCreateFolderModal();
      }
    });
  }

  return {
    attachBindings,
    renderFoldersUI,
    toggleFolderOpen,
    requestCreateFolder,
    onDragStartFromChatList,
    getHiddenChatIdSet
  };
}

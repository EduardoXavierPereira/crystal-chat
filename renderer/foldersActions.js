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
    const wanted = (chatId || '').toString().trim();
    if (!wanted) return;
    const dbg = (() => {
      try {
        return !!window.__ccDebugFolders;
      } catch {
        return false;
      }
    })();
    // Remove all occurrences to avoid duplicates keeping the chat hidden.
    for (let i = f.chatIds.length - 1; i >= 0; i--) {
      if ((f.chatIds[i] || '').toString().trim() === wanted) {
        if (dbg) {
          try {
            console.debug('[folders] removeChatFromAllFolders', { folderId: f.id, chatId: wanted });
          } catch {
            // ignore
          }
        }
        f.chatIds.splice(i, 1);
      }
    }
  });
}

function removeChatFromFolderById(folders, folderId, chatId) {
  const folder = findFolder(folders, folderId);
  if (!folder || !Array.isArray(folder.chatIds)) return false;
  const wanted = (chatId || '').toString().trim();
  if (!wanted) return false;
  let removed = false;
  for (let i = folder.chatIds.length - 1; i >= 0; i--) {
    if ((folder.chatIds[i] || '').toString().trim() === wanted) {
      folder.chatIds.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

function getAllFolderChatIds(folders) {
  const out = new Set();
  visitFolders(folders, (f) => {
    (f.chatIds || []).forEach((id) => {
      const v = (id || '').toString().trim();
      if (v) out.add(v);
    });
  });
  return out;
}

function listFoldersFlat(folders) {
  const out = [];
  const walk = (arr, depth) => {
    (arr || []).forEach((f) => {
      if (!f) return;
      out.push({ id: f.id, name: (f.name || 'Folder').toString(), depth: depth || 0 });
      walk(f.folders || [], (depth || 0) + 1);
    });
  };
  walk(folders, 0);
  return out;
}

export function createFoldersActions({ els, state, saveUIState, renderChatsUI, applySidebarSelection }) {
  const DRAG_MIME = 'application/x-crystal-chat-dnd';

  let folderCreateOpen = false;

  function ensureFoldersInitialized() {
    if (!Array.isArray(state.folders)) state.folders = [];
    if (!Array.isArray(state.rootChatIds)) state.rootChatIds = [];
  }

  function removeChatFromRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    for (let i = state.rootChatIds.length - 1; i >= 0; i--) {
      if ((state.rootChatIds[i] || '').toString().trim() === id) state.rootChatIds.splice(i, 1);
    }
  }

  function addChatToRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    const exists = state.rootChatIds.some((x) => (x || '').toString().trim() === id);
    if (!exists) state.rootChatIds.push(id);
  }

  function createFolderAtRoot(name) {
    ensureFoldersInitialized();
    state.folders.push({ id: newId(), name: (name || 'Folder').toString(), open: true, folders: [], chatIds: [] });
    saveUIState(state);
    renderChatsUI();
  }

  function removeChatFromRoot(chatId) {
    ensureFoldersInitialized();
    const id = (chatId || '').toString().trim();
    if (!id) return;
    removeChatFromRootList(id);
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

    if (!folderId) {
      try {
        window.requestAnimationFrame(() => {
          const el = document.querySelector(`[data-chat-id="${CSS.escape(id)}"]`);
          el?.scrollIntoView?.({ block: 'nearest' });
        });
      } catch {
        // ignore
      }
    }
  }

  function renderFoldersUI() {
    ensureFoldersInitialized();

    try {
      const open = typeof state.foldersOpen === 'boolean' ? state.foldersOpen : true;
      const group = els.foldersListEl?.closest?.('.folders-group');
      group?.classList?.toggle?.('collapsed', !open);
      els.foldersToggleBtn?.classList?.toggle?.('open', !!open);
      els.foldersToggleBtn?.setAttribute?.('aria-expanded', open ? 'true' : 'false');
      els.foldersChevronEl?.classList?.toggle?.('open', !!open);
    } catch {
      // ignore
    }

    const open = typeof state.foldersOpen === 'boolean' ? state.foldersOpen : true;
    if (!open) {
      if (els.foldersListEl) els.foldersListEl.innerHTML = '';
      return;
    }

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
      const chatId = (payload.id || '').toString().trim();
      if (!chatId) return;
      removeChatFromAllFolders(state.folders, chatId);
      if (targetFolderId) {
        removeChatFromRootList(chatId);
        const target = findFolder(state.folders, targetFolderId);
        if (!target) return;
        if (!Array.isArray(target.chatIds)) target.chatIds = [];
        const exists = target.chatIds.some((x) => (x || '').toString().trim() === chatId);
        if (!exists) target.chatIds.push(chatId);
        target.open = true;
      } else {
        addChatToRootList(chatId);
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

  function moveChatToFolder(chatId, targetFolderId) {
    ensureFoldersInitialized();
    const id = (chatId || '').toString().trim();
    if (!id) return;
    const folderId = targetFolderId == null ? null : (targetFolderId || '').toString().trim();
    try {
      window.__ccLastChatId = id;
      window.__ccLastFolderId = folderId;
      window.__ccLastFolderAction = 'moveChatToFolder';
    } catch {
      // ignore
    }
    const dbg = (() => {
      try {
        return !!window.__ccDebugFolders;
      } catch {
        return false;
      }
    })();
    const beforeHidden = dbg ? getAllFolderChatIds(state.folders) : null;
    if (dbg) {
      try {
        console.debug('[folders] moveChatToFolder', { chatId: id, targetFolderId: folderId });
      } catch {
        // ignore
      }
    }
    removeChatFromAllFolders(state.folders, id);
    if (folderId) {
      removeChatFromRootList(id);
      const target = findFolder(state.folders, folderId);
      if (!target) return;
      if (!Array.isArray(target.chatIds)) target.chatIds = [];
      const exists = target.chatIds.some((x) => (x || '').toString().trim() === id);
      if (!exists) target.chatIds.push(id);
      target.open = true;
    } else {
      addChatToRootList(id);
    }
    try {
      window.__ccLastFolders = JSON.parse(JSON.stringify(state.folders || []));
    } catch {
      // ignore
    }
    if (dbg) {
      try {
        const afterHidden = getAllFolderChatIds(state.folders);
        console.debug('[folders] moveChatToFolder hiddenSet', {
          chatId: id,
          beforeHas: beforeHidden?.has?.(id),
          afterHas: afterHidden?.has?.(id),
          beforeSize: beforeHidden?.size,
          afterSize: afterHidden?.size
        });
      } catch {
        // ignore
      }
    }
    saveUIState(state);
    renderChatsUI();

    if (!folderId) {
      try {
        window.requestAnimationFrame(() => {
          const el = document.querySelector(`[data-chat-id="${CSS.escape(id)}"]`);
          el?.scrollIntoView?.({ block: 'nearest' });
        });
      } catch {
        // ignore
      }
    }
  }

  function removeChatFromFolders(chatId) {
    ensureFoldersInitialized();
    const id = (chatId || '').toString().trim();
    if (!id) return;
    try {
      window.__ccLastChatId = id;
      window.__ccLastFolderId = null;
      window.__ccLastFolderAction = 'removeChatFromFolders';
    } catch {
      // ignore
    }
    const dbg = (() => {
      try {
        return !!window.__ccDebugFolders;
      } catch {
        return false;
      }
    })();
    const beforeHidden = dbg ? getAllFolderChatIds(state.folders) : null;
    removeChatFromAllFolders(state.folders, id);
    try {
      window.__ccLastFolders = JSON.parse(JSON.stringify(state.folders || []));
    } catch {
      // ignore
    }
    if (dbg) {
      try {
        const afterHidden = getAllFolderChatIds(state.folders);
        console.debug('[folders] removeChatFromFolders hiddenSet', {
          chatId: id,
          beforeHas: beforeHidden?.has?.(id),
          afterHas: afterHidden?.has?.(id),
          beforeSize: beforeHidden?.size,
          afterSize: afterHidden?.size
        });
      } catch {
        // ignore
      }
    }
    saveUIState(state);
    renderChatsUI();
  }

  function getFoldersFlat() {
    ensureFoldersInitialized();
    return listFoldersFlat(state.folders);
  }

  function getRootChatIdSet() {
    ensureFoldersInitialized();
    return new Set((state.rootChatIds || []).map((x) => (x || '').toString().trim()).filter(Boolean));
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
    const out = getAllFolderChatIds(state.folders);
    (state.rootChatIds || []).forEach((x) => {
      const v = (x || '').toString().trim();
      if (v) out.add(v);
    });
    return out;
  }

  function attachBindings() {
    els.foldersNewBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestCreateFolder();
    });

    try {
      const headerEl = els.foldersToggleBtn?.closest?.('.folders-header');
      let lastHeaderDropAt = 0;
      headerEl?.addEventListener('click', (e) => {
        const t = e?.target;
        if (!(t instanceof Element)) return;
        if (t.closest?.('#folders-new-btn')) return;
        if (t.closest?.('#folders-toggle-btn')) return;
        if (Date.now() - lastHeaderDropAt < 450) return;
        els.foldersToggleBtn?.click();
      });

      const onHeaderDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
      };

      const onHeaderDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        lastHeaderDropAt = Date.now();
        handleDrop(e, null);
      };

      headerEl?.addEventListener('dragenter', onHeaderDragOver, true);
      headerEl?.addEventListener('dragover', onHeaderDragOver, true);
      headerEl?.addEventListener('drop', onHeaderDrop, true);
    } catch {
      // ignore
    }

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
    getHiddenChatIdSet,
    getRootChatIdSet,
    moveChatToFolder,
    removeChatFromFolders,
    removeChatFromRoot,
    getFoldersFlat
  };
}

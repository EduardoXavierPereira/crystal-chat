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

export function createFoldersActions({ els, state, saveUIState, renderChatsUI, applySidebarSelection, openConfirm }) {
  const DRAG_MIME = 'application/x-crystal-chat-dnd';

  let folderCreateOpen = false;
  let emojiPickerReady = false;
  let selectedEmoji = '';

  // Single-codepoint, colorful, folder-relevant emoji set (no monochrome symbols)
  const EMOJI_BANK = [
    { e: '📁', tags: ['folder', 'files', 'yellow'] },
    { e: '📂', tags: ['folder', 'open', 'files'] },
    { e: '🧰', tags: ['tools', 'kit', 'projects'] },
    { e: '🔧', tags: ['tool', 'fix', 'wrench'] },
    { e: '🔨', tags: ['tool', 'build'] },
    { e: '🔩', tags: ['hardware', 'bolt'] },
    { e: '📌', tags: ['pin', 'important'] },
    { e: '📍', tags: ['pin', 'location'] },
    { e: '🔖', tags: ['tag', 'bookmark'] },
    { e: '📎', tags: ['clip', 'attachments'] },
    { e: '🧷', tags: ['pin', 'safety'] },
    { e: '📑', tags: ['tabs', 'docs'] },
    { e: '📒', tags: ['notebook', 'notes'] },
    { e: '📓', tags: ['notebook', 'drafts'] },
    { e: '📔', tags: ['notebook', 'journal'] },
    { e: '📕', tags: ['book', 'read'] },
    { e: '📗', tags: ['book', 'green'] },
    { e: '📘', tags: ['book', 'blue'] },
    { e: '📙', tags: ['book', 'orange'] },
    { e: '📚', tags: ['library', 'reading'] },
    { e: '📇', tags: ['index', 'cards'] },
    { e: '📄', tags: ['doc', 'file'] },
    { e: '📃', tags: ['doc', 'draft'] },
    { e: '📰', tags: ['news', 'read'] },
    { e: '💼', tags: ['work', 'business'] },
    { e: '🧳', tags: ['travel', 'packing'] },
    { e: '🧭', tags: ['direction', 'plan'] },
    { e: '🧾', tags: ['receipts', 'finance'] },
    { e: '🪙', tags: ['coins', 'money'] },
    { e: '📦', tags: ['archive', 'box'] },
    { e: '🪜', tags: ['ladder', 'backlog'] },
    { e: '📅', tags: ['calendar', 'date'] },
    { e: '📆', tags: ['calendar', 'schedule'] },
    { e: '⏰', tags: ['alarm', 'time'] },
    { e: '🔒', tags: ['locked', 'private'] },
    { e: '🔓', tags: ['unlocked', 'shared'] },
    { e: '🔐', tags: ['secure', 'vault'] },
    { e: '🔑', tags: ['key', 'access'] },
    { e: '💡', tags: ['ideas', 'inspiration'] },
    { e: '🔦', tags: ['review', 'spotlight'] },
    { e: '⭐', tags: ['favorite', 'star'] },
    { e: '🌟', tags: ['highlight', 'star'] },
    { e: '✨', tags: ['spark', 'new'] },
    { e: '🌙', tags: ['night', 'focus'] },
    { e: '🔥', tags: ['hot', 'priority'] },
    { e: '💧', tags: ['water', 'cooling'] },
    { e: '🌊', tags: ['waves', 'ideas'] },
    { e: '🌲', tags: ['nature', 'green'] },
    { e: '🌳', tags: ['trees', 'green'] },
    { e: '🌿', tags: ['herb', 'green'] },
    { e: '🍀', tags: ['luck', 'green'] },
    { e: '🌸', tags: ['pink', 'spring'] },
    { e: '🎯', tags: ['target', 'goals'] },
    { e: '🎫', tags: ['tickets', 'events'] },
    { e: '🏁', tags: ['done', 'finish'] },
    { e: '🚩', tags: ['flag', 'alert'] },
    { e: '🪧', tags: ['sign', 'notice'] },
    { e: '🔴', tags: ['red', 'priority'] },
    { e: '🟠', tags: ['orange', 'in-progress'] },
    { e: '🟡', tags: ['yellow', 'pending'] },
    { e: '🟢', tags: ['green', 'go'] },
    { e: '🔵', tags: ['blue'] },
    { e: '🟣', tags: ['purple'] },
    { e: '🟤', tags: ['brown'] },
    { e: '🟥', tags: ['red', 'square'] },
    { e: '🟧', tags: ['orange', 'square'] },
    { e: '🟨', tags: ['yellow', 'square'] },
    { e: '🟩', tags: ['green', 'square'] },
    { e: '🟦', tags: ['blue', 'square'] },
    { e: '🟪', tags: ['purple', 'square'] },
    { e: '🟫', tags: ['brown', 'square'] },
    { e: '⚪', tags: ['white', 'circle'] },
    { e: '⚫', tags: ['black', 'circle'] },
    { e: '🔶', tags: ['orange', 'diamond'] },
    { e: '🔷', tags: ['blue', 'diamond'] },
    { e: '💬', tags: ['chat', 'speech'] },
    { e: '💭', tags: ['thought', 'idea'] },
    { e: '📝', tags: ['notes', 'todo'] },
    { e: '🏠', tags: ['home', 'personal'] },
    { e: '🏢', tags: ['office', 'work'] },
    { e: '🏭', tags: ['factory', 'ops'] },
    { e: '🏪', tags: ['shop', 'store'] },
    { e: '🏥', tags: ['health', 'med'] },
    { e: '🏦', tags: ['bank', 'finance'] },
    { e: '💻', tags: ['code', 'dev'] },
    { e: '📱', tags: ['mobile'] },
    { e: '📲', tags: ['mobile', 'sync'] },
    { e: '💾', tags: ['save', 'storage'] },
    { e: '💿', tags: ['disc', 'media'] },
    { e: '📀', tags: ['disc', 'media'] },
    { e: '🎮', tags: ['games', 'fun'] },
    { e: '🎵', tags: ['music', 'audio'] },
    { e: '🎶', tags: ['music'] },
    { e: '🎧', tags: ['audio', 'headphones'] },
    { e: '🎤', tags: ['mic', 'record'] },
    { e: '🎬', tags: ['video', 'media'] },
    { e: '📷', tags: ['photo'] },
    { e: '📸', tags: ['photo'] },
    { e: '🎨', tags: ['design', 'art'] },
    { e: '🧪', tags: ['lab', 'science'] },
    { e: '🔬', tags: ['research', 'science'] },
    { e: '🔭', tags: ['space', 'research'] },
    { e: '📡', tags: ['radio', 'signal'] },
    { e: '🏆', tags: ['trophy', 'wins'] },
    { e: '❤️', tags: ['red', 'heart'] },
    { e: '🧡', tags: ['orange', 'heart'] },
    { e: '💛', tags: ['yellow', 'heart'] },
    { e: '💚', tags: ['green', 'heart'] },
    { e: '💙', tags: ['blue', 'heart'] },
    { e: '💜', tags: ['purple', 'heart'] },
    { e: '🖤', tags: ['black', 'heart'] },
    { e: '🤍', tags: ['white', 'heart'] },
    { e: '✅', tags: ['done', 'complete'] },
    { e: '❌', tags: ['remove', 'delete'] },
    { e: '❓', tags: ['question'] },
    { e: '❗', tags: ['alert'] },
    { e: '💯', tags: ['top', 'quality'] },
    { e: '🆕', tags: ['new'] },
    { e: '🆗', tags: ['ok'] },
    { e: '🍎', tags: ['apple', 'red'] },
    { e: '🍊', tags: ['orange', 'fruit'] },
    { e: '🍋', tags: ['yellow', 'fruit'] },
    { e: '🍏', tags: ['green', 'fruit'] },
    { e: '🍇', tags: ['purple', 'fruit'] },
    { e: '🍓', tags: ['red', 'fruit'] },
    { e: '🥝', tags: ['green', 'fruit'] },
    { e: '🥑', tags: ['green', 'fruit'] },
    { e: '🌈', tags: ['rainbow'] },
    { e: '🚲', tags: ['bike'] },
    { e: '⛵', tags: ['boat'] },
    { e: '🚂', tags: ['train'] },
    { e: '🛸', tags: ['ufo', 'fun'] },
    { e: '🎪', tags: ['event', 'fun'] },
    // --- COMMUNICATION & NOTIFICATIONS ---
    { e: '📧', tags: ['email', 'mail', 'inbox'] },
    { e: '📨', tags: ['mail', 'sent', 'incoming'] },
    { e: '🔔', tags: ['notification', 'alert', 'bell'] },
    { e: '🔕', tags: ['mute', 'silent', 'notifications'] },
    { e: '📣', tags: ['announcement', 'megaphone', 'broadcast'] },
    { e: '📢', tags: ['loudspeaker', 'alert'] },
    { e: '🗣️', tags: ['speaking', 'discussion', 'voice'] },
    // --- DATA & ANALYTICS ---
    { e: '📈', tags: ['growth', 'stats', 'trending'] },
    { e: '📉', tags: ['loss', 'stats', 'down'] },
    { e: '📊', tags: ['chart', 'data', 'analytics'] },
    { e: '🔍', tags: ['search', 'find', 'glass'] },
    { e: '🔎', tags: ['search', 'details', 'zoom'] },
    { e: '🧮', tags: ['math', 'calculation', 'abacus'] },

    // --- TIME & STATUS ---
    { e: '⌛', tags: ['waiting', 'sand', 'timer'] },
    { e: '⏳', tags: ['loading', 'progress', 'timer'] },
    { e: '⏱️', tags: ['stopwatch', 'fast', 'timer'] },
    { e: '⏲️', tags: ['timer', 'clock', 'limit'] },
    { e: '💤', tags: ['sleep', 'inactive', 'idle'] },
    { e: '🚧', tags: ['construction', 'maintenance', 'building'] },
    { e: '🛑', tags: ['stop', 'halt', 'error'] },

    // --- HARDWARE & OFFICE ---
    { e: '⌨️', tags: ['keyboard', 'typing', 'input'] },
    { e: '🖱️', tags: ['mouse', 'click', 'computer'] },
    { e: '🖨️', tags: ['print', 'hardware', 'office'] },
    { e: '🖥️', tags: ['monitor', 'screen', 'desktop'] },
    { e: '🔋', tags: ['battery', 'power', 'energy'] },
    { e: '🔌', tags: ['plug', 'power', 'connect'] },
    { e: '🕯️', tags: ['candle', 'legacy', 'light'] },

    // --- PEOPLE & SOCIAL ---
    { e: '👤', tags: ['user', 'profile', 'person'] },
    { e: '👥', tags: ['team', 'users', 'group'] },
    { e: '🤝', tags: ['partnership', 'deal', 'agreement'] },
    { e: '🫂', tags: ['support', 'community', 'embrace'] },
    { e: '🙋', tags: ['question', 'volunteer', 'person'] },

    // --- NAVIGATION & SYMBOLS ---
    { e: '🔄', tags: ['sync', 'refresh', 'update'] },
    { e: '🔃', tags: ['reload', 'cycle', 'repeat'] },
    { e: '➡️', tags: ['next', 'arrow', 'right'] },
    { e: '⬅️', tags: ['back', 'arrow', 'left'] },
    { e: '⬆️', tags: ['up', 'top', 'priority'] },
    { e: '⬇️', tags: ['down', 'bottom', 'low'] },
    { e: '➕', tags: ['add', 'plus', 'new'] },
    { e: '➖', tags: ['minus', 'remove', 'less'] },
    { e: '♾️', tags: ['infinity', 'forever', 'loop'] },

    // --- WEATHER & ENVIRONMENT ---
    { e: '☀️', tags: ['sun', 'bright', 'day'] },
    { e: '☁️', tags: ['cloud', 'weather', 'storage'] },
    { e: '⛈️', tags: ['storm', 'bugs', 'problem'] },
    { e: '❄️', tags: ['cold', 'winter', 'frozen'] },
    { e: '⚡', tags: ['fast', 'flash', 'energy'] },
    { e: '🌬️', tags: ['wind', 'air', 'speed'] },

    // --- FOOD & BREAKS ---
    { e: '☕', tags: ['coffee', 'break', 'morning'] },
    { e: '🍵', tags: ['tea', 'relax', 'hot'] },
    { e: '🥤', tags: ['drink', 'soda', 'refreshment'] },
    { e: '🥪', tags: ['lunch', 'food', 'snack'] },
    { e: '🍕', tags: ['pizza', 'party', 'food'] },
    { e: '🍦', tags: ['treat', 'dessert', 'icecream'] },

    // --- ANIMALS (THEMATIC) ---
    { e: '🦋', tags: ['butterfly', 'design', 'change'] },
    { e: '🐝', tags: ['busy', 'work', 'bee'] },
    { e: '🐜', tags: ['bug', 'error', 'tiny'] },
    { e: '🦉', tags: ['wisdom', 'knowledge', 'night'] },
    { e: '🦄', tags: ['special', 'rare', 'magic'] },

    // --- ADDITIONAL OBJECTS ---
    { e: '🎁', tags: ['gift', 'reward', 'bonus'] },
    { e: '💡', tags: ['idea', 'light', 'discovery'] },
    { e: '🔦', tags: ['flashlight', 'debug', 'investigate'] },
    { e: '🎈', tags: ['celebration', 'launch', 'fun'] },
    { e: '🧸', tags: ['comfort', 'testing', 'toy'] },
    { e: '💎', tags: ['gem', 'valuable', 'premium', 'crystal'] }
  ];

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

  function createFolderAtRoot(name, icon) {
    ensureFoldersInitialized();
    state.folders.push({
      id: newId(),
      name: (name || 'Folder').toString(),
      icon: (icon || '').toString(),
      open: true,
      folders: [],
      chatIds: []
    });
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
    selectedEmoji = '';
    if (els.folderEmojiSearchEl) els.folderEmojiSearchEl.value = '';
    if (els.folderEmojiPickerEl && !emojiPickerReady) {
      buildEmojiPicker();
    }
    if (els.folderEmojiPickerEl && emojiPickerReady) {
      buildEmojiPicker();
    }
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
    const icon = (selectedEmoji || '').toString().trim();
    if (!name) return;
    closeCreateFolderModal();
    createFolderAtRoot(name, icon);
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
      onDeleteFolder: (folderId) => {
        if (!folderId) return;
        if (typeof openConfirm === 'function') {
          openConfirm(
            els,
            'Delete this folder? Chats inside will be moved to Trash (kept up to 30 days).',
            async () => {
              deleteFolder(folderId);
            },
            (v) => (state.confirmAction = v)
          );
        } else {
          deleteFolder(folderId);
        }
      },
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

  function deleteFolder(folderId) {
    ensureFoldersInitialized();
    const id = (folderId || '').toString().trim();
    if (!id) return;
    const removed = removeFolderById(state.folders, id);
    if (!removed) return;

    const collectChats = (folder) => {
      const ids = [];
      (folder?.chatIds || []).forEach((cid) => {
        const chatId = (cid || '').toString().trim();
        if (chatId) ids.push(chatId);
      });
      (folder?.folders || []).forEach((child) => {
        ids.push(...collectChats(child));
      });
      return ids;
    };

    const chatsToTrash = collectChats(removed);

    // Dispatch trash events so trashActions handles retention/deletedAt
    chatsToTrash.forEach((chatId) => {
      try {
        window.dispatchEvent(new CustomEvent('cc:trashChat', { detail: { chatId } }));
      } catch {
        // ignore
      }
      removeChatFromRootList(chatId);
      removeChatFromAllFolders(state.folders, chatId);
    });

    saveUIState(state);
    renderChatsUI();
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

  function buildEmojiPicker() {
    if (!els.folderEmojiPickerEl) return;
    const picker = els.folderEmojiPickerEl;
    picker.innerHTML = '';
    const rawQuery = (els.folderEmojiSearchEl?.value || '').toString().trim();
    const query = rawQuery.toLowerCase();
    const items = EMOJI_BANK.map((entry) =>
      typeof entry === 'string' ? { e: entry, tags: [] } : entry || { e: '', tags: [] }
    );
    const filtered = items.filter(({ e, tags }) => {
      if (!e) return false;
      if (e.includes('‍') || e.includes('️')) return false; // skip multi-emoji/ZWJ/VS combos
      if (Array.from(e).length !== 1) return false;
      if (!query) return true;
      const haystack = [e.toLowerCase(), ...(Array.isArray(tags) ? tags.map((t) => (t || '').toLowerCase()) : [])];
      return haystack.some((t) => t.includes(query));
    });
    if (picker.dataset.query !== rawQuery) {
      picker.dataset.query = rawQuery;
    }
    filtered.forEach(({ e: emoji }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `emoji-btn ${emoji === selectedEmoji ? 'selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.textContent = emoji;
      btn.onclick = (e) => {
        e.preventDefault();
        selectedEmoji = emoji;
        buildEmojiPicker();
      };
      picker.appendChild(btn);
    });
    emojiPickerReady = true;
  }

  function attachBindings() {
    els.foldersNewBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestCreateFolder();
    });

    els.folderEmojiSearchEl?.addEventListener('input', () => {
      buildEmojiPicker();
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

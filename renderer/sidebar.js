export function getEls() {
  return {
    chatListEl: document.getElementById('chat-list'),
    chatSearchInput: document.getElementById('chat-search-input'),
    chatHeaderEl: document.getElementById('chat-header'),
    chatHeaderTitleEl: document.getElementById('chat-header-title'),
    chatHeaderTokensEl: document.getElementById('chat-header-tokens'),
    chatHeaderToolsBtn: document.getElementById('chat-header-tools-btn'),
    chatHeaderToolsPopover: document.getElementById('chat-header-tools-popover'),
    textSizeSlider: document.getElementById('text-size-slider'),
    textSizeValue: document.getElementById('text-size-value'),
    magneticScrollToggleEl: document.getElementById('magnetic-scroll-toggle'),
    messagesEl: document.getElementById('messages'),
    promptForm: document.getElementById('prompt-form'),
    promptAttachmentsEl: document.getElementById('prompt-attachments'),
    promptInput: document.getElementById('prompt-input'),
    promptToolsBtn: document.getElementById('prompt-tools-btn'),
    promptToolsPopover: document.getElementById('prompt-tools-popover'),
    promptInsertBtn: document.getElementById('prompt-insert-btn'),
    promptInsertPopover: document.getElementById('prompt-insert-popover'),
    promptInsertTextBtn: document.getElementById('prompt-insert-text-btn'),
    promptInsertImageBtn: document.getElementById('prompt-insert-image-btn'),
    promptInsertTextInput: document.getElementById('prompt-insert-text-input'),
    promptInsertImageInput: document.getElementById('prompt-insert-image-input'),
    modelDropdownEl: document.getElementById('model-dropdown'),
    creativitySlider: document.getElementById('creativity-slider'),
    creativityValue: document.getElementById('creativity-value'),
    systemPromptInput: document.getElementById('system-prompt'),
    toolsTogglesContainerEl: document.getElementById('tools-toggles-container'),
    updateMemoryToggleEl: document.getElementById('update-memory-toggle'),
    themeSegmentEl: document.getElementById('theme-segment'),
    themeSystemBtn: document.getElementById('theme-system-btn'),
    themeDarkBtn: document.getElementById('theme-dark-btn'),
    themeLightBtn: document.getElementById('theme-light-btn'),
    accentSwatchesEl: document.getElementById('accent-swatches'),
    modelInstallEl: document.getElementById('model-install'),
    modelInstallLabelEl: document.getElementById('model-install-label'),
    modelInstallPercentEl: document.getElementById('model-install-percent'),
    modelInstallBarFillEl: document.getElementById('model-install-bar-fill'),
    memoryEditorPanelEl: document.getElementById('memory-editor-panel'),
    memoryEditorThinkingToggleEl: document.getElementById('memory-editor-thinking-toggle'),
    memoryEditorThinkingEl: document.getElementById('memory-editor-thinking'),
    memoryEditorSkipBtn: document.getElementById('memory-editor-skip'),
    sendBtn: document.getElementById('send-btn'),
    typingIndicator: document.getElementById('typing-indicator'),
    typingIndicatorLabelEl: document.getElementById('typing-indicator-label'),
    errorEl: document.getElementById('error'),
    newChatBtn: document.getElementById('new-chat'),
    foldersToggleBtn: document.getElementById('folders-toggle-btn'),
    foldersChevronEl: document.getElementById('folders-chevron'),
    foldersListEl: document.getElementById('folders-list'),
    foldersNewBtn: document.getElementById('folders-new-btn'),
    trashBtn: document.getElementById('trash-btn'),
    trashSearchInput: document.getElementById('trash-search-input'),
    trashListEl: document.getElementById('trash-list'),
    trashRestoreAllBtn: document.getElementById('trash-restore-all'),
    trashDeleteAllBtn: document.getElementById('trash-delete-all'),
    memoriesBtn: document.getElementById('memories-btn'),
    memoriesSearchInput: document.getElementById('memories-search-input'),
    memoriesListEl: document.getElementById('memories-list'),
    memoriesAddInput: document.getElementById('memories-add-input'),
    memoriesAddBtn: document.getElementById('memories-add-btn'),
    statusEl: document.getElementById('status'),
    confirmModalEl: document.getElementById('confirm-modal'),
    confirmMessageEl: document.getElementById('confirm-message'),
    confirmCancelBtn: document.getElementById('confirm-cancel'),
    confirmOkBtn: document.getElementById('confirm-ok'),
    updateModalEl: document.getElementById('update-modal'),
    updateMessageEl: document.getElementById('update-message'),
    updateLaterBtn: document.getElementById('update-later'),
    updateRestartBtn: document.getElementById('update-restart'),
    memoryEditModalEl: document.getElementById('memory-edit-modal'),
    memoryEditInputEl: document.getElementById('memory-edit-input'),
    memoryEditCancelBtn: document.getElementById('memory-edit-cancel'),
    memoryEditSaveBtn: document.getElementById('memory-edit-save'),
    folderCreateModalEl: document.getElementById('folder-create-modal'),
    folderCreateInputEl: document.getElementById('folder-create-input'),
    folderEmojiPickerEl: document.getElementById('folder-emoji-picker'),
    folderEmojiSearchEl: document.getElementById('folder-emoji-search'),
    folderCreateCancelBtn: document.getElementById('folder-create-cancel'),
    folderCreateOkBtn: document.getElementById('folder-create-ok'),
    setupModalEl: document.getElementById('setup-modal'),
    setupMessageEl: document.getElementById('setup-message'),
    setupProgressLabelEl: document.getElementById('setup-progress-label'),
    setupProgressPercentEl: document.getElementById('setup-progress-percent'),
    setupProgressBarFillEl: document.getElementById('setup-progress-bar-fill'),
    setupStepsEl: document.getElementById('setup-steps'),
    setupRetryBtn: document.getElementById('setup-retry'),
    setupCloseBtn: document.getElementById('setup-close')
  };
}

export function chatTitleFromMessages(chat) {
  if (chat.title && chat.title.trim() && chat.title.trim() !== 'New chat') {
    return chat.title.trim();
  }

  const getActiveBranchMessages = () => {
    const branches = Array.isArray(chat?.branches) ? chat.branches : null;
    if (!branches || branches.length === 0) return Array.isArray(chat?.messages) ? chat.messages : [];
    const activeId = typeof chat.activeBranchId === 'string' ? chat.activeBranchId : null;
    const active = activeId ? branches.find((b) => b && b.id === activeId) : null;
    const msgs = Array.isArray(active?.messages) ? active.messages : null;
    if (msgs) return msgs;
    const first = branches.find((b) => Array.isArray(b?.messages));
    return Array.isArray(first?.messages) ? first.messages : [];
  };

  const msgs = getActiveBranchMessages();
  if (msgs.length === 0) return 'New chat';
  const firstUser = msgs.find((m) => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
  return trimmed;
}

function escapeHtml(text) {
  return (text || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function escapeRegExp(text) {
  return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderChats({
  els,
  state,
  onSetActiveChat,
  onStartRename,
  onTrashChat,
  onMoveChatToFolder,
  onRemoveChatFromFolders,
  getFoldersFlat,
  hiddenChatIds,
  onDragStartChat
}) {
  els.chatListEl.innerHTML = '';
  els.newChatBtn?.classList.toggle('active', state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === null && !!state.pendingNew);

  const query = (state.chatQuery || '').trim().toLowerCase();
  const base = query
    ? state.chats.filter((chat) => chatTitleFromMessages(chat).toLowerCase().includes(query))
    : state.chats;

  const hiddenSet = hiddenChatIds && typeof hiddenChatIds.has === 'function' ? hiddenChatIds : null;
  // When searching, surface all chats (including those in folders); otherwise hide foldered/root-hidden ones.
  const chats =
    hiddenSet && !query
      ? base.filter((c) => !hiddenSet.has((c?.id || '').toString().trim()))
      : base;

  const rootSet = new Set((state.rootChatIds || []).map((x) => (x || '').toString().trim()).filter(Boolean));
  const folderSet = new Set();
  const walkFolders = (arr) => {
    (arr || []).forEach((f) => {
      (f?.chatIds || []).forEach((id) => {
        const v = (id || '').toString().trim();
        if (v) folderSet.add(v);
      });
      walkFolders(f?.folders || []);
    });
  };
  walkFolders(state.folders);

  if (!chats.length) {
    const empty = document.createElement('div');
    empty.className = 'chat-list-empty';
    if (query) {
      empty.textContent = `No chats found matching "${(state.chatQuery || '').toString().trim()}"`;
    } else {
      empty.textContent = state.chats.length ? 'No chats found.' : 'No chats yet.';
    }
    els.chatListEl.appendChild(empty);
    return;
  }

  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${state.sidebarSelection.kind === 'chat' && chat.id === state.sidebarSelection.id ? 'active' : ''}`;
    try {
      item.dataset.chatId = (chat.id || '').toString();
    } catch {
      // ignore
    }
    item.onclick = () => onSetActiveChat(chat.id);

    item.draggable = true;
    item.ondragstart = (e) => {
      onDragStartChat?.(e, chat.id);
    };

    const content = document.createElement('div');
    content.className = 'chat-name';
    const isEditing = state.renamingId === chat.id;

    if (isEditing) {
      const input = document.createElement('input');
      input.className = 'chat-rename-input';
      input.value = chatTitleFromMessages(chat);
      input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await onStartRename.commit(chat.id, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          await onStartRename.cancel();
        }
      };
      input.onblur = async () => {
        await onStartRename.commit(chat.id, input.value);
      };
      content.appendChild(input);
      requestAnimationFrame(() => input.focus());
    } else {
      const name = document.createElement('div');
      const title = chatTitleFromMessages(chat);
      if (query) {
        const safeTitle = escapeHtml(title);
        const safeQuery = escapeRegExp(query);
        const re = new RegExp(safeQuery, 'ig');
        name.innerHTML = safeTitle.replace(re, (m) => `<mark class="chat-search-hit">${escapeHtml(m)}</mark>`);
      } else {
        name.textContent = title;
      }
      content.appendChild(name);
    }

    item.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    const menuWrap = document.createElement('div');
    menuWrap.className = 'chat-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'chat-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Chat actions');
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.textContent = '⋯';

    const menu = document.createElement('div');
    menu.className = 'chat-menu hidden';
    menu.setAttribute('role', 'menu');

    const addToFolderItem = document.createElement('button');
    addToFolderItem.type = 'button';
    addToFolderItem.className = 'chat-menu-item has-submenu';
    addToFolderItem.setAttribute('role', 'menuitem');
    addToFolderItem.setAttribute('aria-haspopup', 'menu');
    addToFolderItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M3 8.2C3 7.07989 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H9.67452C10.1637 5 10.4083 5 10.6385 5.05526C10.8425 5.10425 11.0376 5.18506 11.2166 5.29472C11.4184 5.4184 11.5914 5.59135 11.9373 5.93726L12.0627 6.06274C12.4086 6.40865 12.5816 6.5816 12.7834 6.70528C12.9624 6.81494 13.1575 6.89575 13.3615 6.94474C13.5917 7 13.8363 7 14.3255 7H17.8C18.9201 7 19.4802 7 19.908 7.21799C20.2843 7.40973 20.5903 7.71569 20.782 8.09202C21 8.51984 21 9.0799 21 10.2V15.8C21 16.9201 21 17.4802 20.782 17.908C20.5903 18.2843 20.2843 18.5903 19.908 18.782C19.4802 19 18.9201 19 17.8 19H6.2C5.07989 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Add to folder</span>'
      + '<span class="chat-menu-item-chevron" aria-hidden="true">▸</span>';

    const removeFromFoldersItem = document.createElement('button');
    removeFromFoldersItem.type = 'button';
    removeFromFoldersItem.className = 'chat-menu-item';
    removeFromFoldersItem.setAttribute('role', 'menuitem');
    removeFromFoldersItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M3 8.2C3 7.07989 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H9.67452C10.1637 5 10.4083 5 10.6385 5.05526C10.8425 5.10425 11.0376 5.18506 11.2166 5.29472C11.4184 5.4184 11.5914 5.59135 11.9373 5.93726L12.0627 6.06274C12.4086 6.40865 12.5816 6.5816 12.7834 6.70528C12.9624 6.81494 13.1575 6.89575 13.3615 6.94474C13.5917 7 13.8363 7 14.3255 7H17.8C18.9201 7 19.4802 7 19.908 7.21799C20.2843 7.40973 20.5903 7.71569 20.782 8.09202C21 8.51984 21 9.0799 21 10.2V15.8C21 16.9201 21 17.4802 20.782 17.908C20.5903 18.2843 20.2843 18.5903 19.908 18.782C19.4802 19 18.9201 19 17.8 19H6.2C5.07989 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M7 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Remove from folders</span>';

    const removeFromRootItem = document.createElement('button');
    removeFromRootItem.type = 'button';
    removeFromRootItem.className = 'chat-menu-item';
    removeFromRootItem.setAttribute('role', 'menuitem');
    removeFromRootItem.innerHTML =
      '<span class="chat-menu-item-text">Remove from root</span>';

    const renameItem = document.createElement('button');
    renameItem.type = 'button';
    renameItem.className = 'chat-menu-item';
    renameItem.setAttribute('role', 'menuitem');
    renameItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Rename</span>';

    const deleteItem = document.createElement('button');
    deleteItem.type = 'button';
    deleteItem.className = 'chat-menu-item danger';
    deleteItem.setAttribute('role', 'menuitem');
    deleteItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Delete</span>';

    const buildMainMenu = () => {
      menu.innerHTML = '';
      const chatIdNorm = (chat.id || '').toString().trim();
      const inFolder = folderSet.has(chatIdNorm);
      const inRoot = rootSet.has(chatIdNorm);

      if (inFolder) {
        menu.appendChild(removeFromFoldersItem);
      } else if (inRoot) {
        menu.appendChild(removeFromRootItem);
      } else {
        menu.appendChild(addToFolderItem);
      }

      menu.appendChild(renameItem);
      menu.appendChild(deleteItem);
    };

    const showFolderPicker = () => {
      menu.innerHTML = '';

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'chat-menu-item';
      back.setAttribute('role', 'menuitem');
      back.innerHTML =
        '<span class="chat-menu-item-text">← Back</span>';
      back.onclick = (e) => {
        e.stopPropagation();
        buildMainMenu();
      };
      menu.appendChild(back);

      const mk = (label, targetId) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-menu-item';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = `<span class="chat-menu-item-text">${escapeHtml(label)}</span>`;
        b.onclick = (ev) => {
          ev.stopPropagation();
          try {
            window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId: chat.id, folderId: targetId } }));
          } catch {
            // ignore
          }
          closeMenu();
        };
        menu.appendChild(b);
      };

      mk('Root', null);
      const folders = Array.isArray(getFoldersFlat?.()) ? getFoldersFlat() : [];
      folders.forEach((f) => {
        const prefix = f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '';
        mk(prefix + (f.name || 'Folder'), f.id);
      });
    };

    buildMainMenu();

    let cleanupMenuEvents = null;

    const closeMenu = () => {
      menu.classList.add('hidden');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }
    };

    const openMenu = () => {
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }

      menu.classList.remove('hidden');
      buildMainMenu();
      menuBtn.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');

      const onDocClick = (ev) => {
        if (!menuWrap.contains(ev.target)) closeMenu();
      };

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeMenu();
        }
      };

      window.addEventListener('click', onDocClick, true);
      window.addEventListener('keydown', onKeyDown, true);

      cleanupMenuEvents = () => {
        window.removeEventListener('click', onDocClick, true);
        window.removeEventListener('keydown', onKeyDown, true);
      };
    };

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      if (!menu.classList.contains('hidden')) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    menu.onclick = (e) => {
      e.stopPropagation();
    };

    addToFolderItem.onclick = (e) => {
      e.stopPropagation();
      showFolderPicker();
    };

    removeFromFoldersItem.onclick = (e) => {
      e.stopPropagation();
      try {
        window.dispatchEvent(new CustomEvent('cc:removeChatFromFolders', { detail: { chatId: chat.id } }));
      } catch {
        // ignore
      }
      closeMenu();
    };

    removeFromRootItem.onclick = (e) => {
      e.stopPropagation();
      try {
        window.dispatchEvent(new CustomEvent('cc:removeChatFromRoot', { detail: { chatId: chat.id } }));
      } catch {
        // ignore
      }
      closeMenu();
    };

    renameItem.onclick = (e) => {
      e.stopPropagation();
      closeMenu();
      onStartRename.begin(chat.id);
    };

    deleteItem.onclick = async (e) => {
      e.stopPropagation();
      closeMenu();
      await onTrashChat(chat.id);
    };

    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menu);
    actions.appendChild(menuWrap);

    item.appendChild(actions);
    els.chatListEl.appendChild(item);
  });

  try {
    window.__ccLastRenderedChatIds = chats.map((c) => (c?.id || '').toString().trim());
    window.__ccLastRenderedChatCount = chats.length;
  } catch {
    // ignore
  }
}

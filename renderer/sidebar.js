import { buildMenu, ICONS } from './utils/menuBuilder.js';

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
    readOnlyToggleEl: document.getElementById('read-only-toggle'),
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
    memoriesExportBtn: document.getElementById('memories-export-btn'),
    memoriesImportBtn: document.getElementById('memories-import-btn'),
    memoriesImportInput: document.getElementById('memories-import-input'),
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
    importConfirmationModalEl: document.getElementById('import-confirmation-modal'),
    importConfirmationMessageEl: document.getElementById('import-confirmation-message'),
    importConfirmationCancelBtn: document.getElementById('import-confirmation-cancel'),
    importConfirmationAddBtn: document.getElementById('import-confirmation-add'),
    importConfirmationOverrideBtn: document.getElementById('import-confirmation-override'),
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

    actions.appendChild(
      buildMenu({
        ariaLabel: 'Chat actions',
        items: [
          {
            label: 'Move to…',
            icon: ICONS.folder,
            isSubmenu: true,
            onClick: () => {
              // Submenu handled by buildMenu
            }
          },
          {
            label: 'Rename',
            icon: ICONS.rename,
            onClick: () => {
              onStartRename.begin(chat.id);
            }
          },
          {
            label: 'Delete',
            icon: ICONS.trash,
            isDanger: true,
            onClick: async () => {
              await onTrashChat(chat.id);
            }
          }
        ],
        getFoldersList: () => {
          const root = { label: 'Root', id: null, onClick: (folderId) => {
            try {
              window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId: chat.id, folderId } }));
            } catch {
              // ignore
            }
          } };
          const folders = Array.isArray(getFoldersFlat?.()) ? getFoldersFlat() : [];
          return [root, ...folders.map((f) => ({
            label: (f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '') + (f.name || 'Folder'),
            id: f.id,
            onClick: (folderId) => {
              try {
                window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId: chat.id, folderId } }));
              } catch {
                // ignore
              }
            }
          }))];
        }
      })
    );

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

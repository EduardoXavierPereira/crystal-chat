/**
 * FoldersController - Main orchestrator for folder operations
 * Manages folder CRUD, chat movement, drag-drop, and UI rendering
 */

import { renderFoldersTree } from '../folders.js';
import * as folderTreeUtils from '../utils/folderTreeUtils.js';
import { createEmojiPicker } from '../folders/emojiPicker.js';
import { createDragDropHandler } from '../folders/dragDropHandler.js';

export class FoldersController {
  constructor({ els, state, saveUIState, renderChatsUI, applySidebarSelection, openConfirm, signal }) {
    this.els = els;
    this.state = state;
    this.saveUIState = saveUIState;
    this.renderChatsUI = renderChatsUI;
    this.applySidebarSelection = applySidebarSelection;
    this.openConfirm = openConfirm;
    this.signal = signal;

    // State
    this.folderCreateOpen = false;

    // Initialize sub-modules
    this.emojiPicker = createEmojiPicker({ els });
    this.dragDropHandler = createDragDropHandler({
      state,
      saveUIState,
      renderChatsUI,
      folderTreeUtils
    });

    this.attachListeners();
  }

  /**
   * Ensure folders and root chat IDs are initialized
   */
  ensureFoldersInitialized() {
    if (!Array.isArray(this.state.folders)) this.state.folders = [];
    if (!Array.isArray(this.state.rootChatIds)) this.state.rootChatIds = [];

    // Normalize folder structure: ensure all folders have 'open' property
    const normalizeFolders = (folders) => {
      (folders || []).forEach((f) => {
        if (typeof f.open === 'undefined') {
          f.open = true; // Default to open so folders show content
        }
        if (Array.isArray(f.folders)) {
          normalizeFolders(f.folders);
        }
      });
    };
    normalizeFolders(this.state.folders);
  }

  /**
   * Add chat to root list (avoid duplicates)
   */
  addChatToRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    const exists = this.state.rootChatIds.some((x) => (x || '').toString().trim() === id);
    if (!exists) this.state.rootChatIds.push(id);
  }

  /**
   * Remove chat from root list
   */
  removeChatFromRootList(chatId) {
    const id = (chatId || '').toString().trim();
    if (!id) return;
    for (let i = this.state.rootChatIds.length - 1; i >= 0; i--) {
      if ((this.state.rootChatIds[i] || '').toString().trim() === id) this.state.rootChatIds.splice(i, 1);
    }
  }

  /**
   * Create a new folder at root level
   */
  createFolderAtRoot(name, icon) {
    this.ensureFoldersInitialized();
    this.state.folders.push({
      id: folderTreeUtils.newId(),
      name: (name || 'Folder').toString(),
      icon: (icon || '').toString(),
      open: true,
      folders: [],
      chatIds: []
    });
    this.saveUIState(this.state);
    this.renderChatsUI();
  }

  /**
   * Remove chat from root list and update UI
   */
  removeChatFromRoot(chatId) {
    this.ensureFoldersInitialized();
    const id = (chatId || '').toString().trim();
    if (!id) return;
    this.removeChatFromRootList(id);
    this.saveUIState(this.state);
    this.renderChatsUI();
  }

  /**
   * Open the create folder modal
   */
  requestCreateFolder() {
    if (!this.els.folderCreateModalEl || !this.els.folderCreateInputEl) return;
    this.folderCreateOpen = true;
    this.els.folderCreateInputEl.value = '';
    this.emojiPicker.resetSelection();
    if (this.els.folderEmojiSearchEl) this.els.folderEmojiSearchEl.value = '';
    if (this.els.folderEmojiPickerEl && !this.emojiPicker.isReady()) {
      this.emojiPicker.buildPicker();
    }
    if (this.els.folderEmojiPickerEl && this.emojiPicker.isReady()) {
      this.emojiPicker.buildPicker();
    }
    this.els.folderCreateModalEl.classList.remove('hidden');
    requestAnimationFrame(() => this.els.folderCreateInputEl?.focus());
  }

  /**
   * Close the create folder modal
   */
  closeCreateFolderModal() {
    this.folderCreateOpen = false;
    this.els.folderCreateModalEl?.classList.add('hidden');
  }

  /**
   * Commit folder creation from modal
   */
  commitCreateFolderFromModal() {
    if (!this.folderCreateOpen) return;
    const name = (this.els.folderCreateInputEl?.value || '').toString().trim();
    const icon = (this.emojiPicker.getSelected() || '').toString().trim();
    if (!name) return;
    this.closeCreateFolderModal();
    this.createFolderAtRoot(name, icon);
  }

  /**
   * Toggle folder open/closed state
   */
  toggleFolderOpen(id) {
    this.ensureFoldersInitialized();
    const f = folderTreeUtils.findFolder(this.state.folders, id);
    if (!f) return;
    f.open = !f.open;
    this.saveUIState(this.state);
    this.renderChatsUI();

    if (id) {
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

  /**
   * Delete a folder and move its chats to trash
   */
  deleteFolder(folderId) {
    this.ensureFoldersInitialized();
    const id = (folderId || '').toString().trim();
    if (!id) return;

    const removed = folderTreeUtils.removeFolderById(this.state.folders, id);
    if (!removed) return;

    // Collect all chats in the folder tree
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
      this.removeChatFromRootList(chatId);
      folderTreeUtils.removeChatFromAllFolders(this.state.folders, chatId);
    });

    this.saveUIState(this.state);
    this.renderChatsUI();
  }

  /**
   * Render the folders UI tree
   */
  renderFoldersUI() {
    this.ensureFoldersInitialized();

    try {
      const open = typeof this.state.foldersOpen === 'boolean' ? this.state.foldersOpen : true;
      const group = this.els.foldersListEl?.closest?.('.folders-group');
      group?.classList?.toggle?.('collapsed', !open);
      this.els.foldersToggleBtn?.classList?.toggle?.('open', !!open);
      this.els.foldersToggleBtn?.setAttribute?.('aria-expanded', open ? 'true' : 'false');
      this.els.foldersChevronEl?.classList?.toggle?.('open', !!open);
    } catch {
      // ignore
    }

    const open = typeof this.state.foldersOpen === 'boolean' ? this.state.foldersOpen : true;
    if (!open) {
      if (this.els.foldersListEl) this.els.foldersListEl.innerHTML = '';
      return;
    }

    const activeChatId = this.state.sidebarSelection?.kind === 'chat' ? this.state.sidebarSelection.id : null;

    renderFoldersTree({
      els: this.els,
      state: this.state,
      folders: this.state.folders,
      onToggleOpen: (folderId) => this.toggleFolderOpen(folderId),
      onDeleteFolder: (folderId) => {
        if (!folderId) return;
        if (typeof this.openConfirm === 'function') {
          this.openConfirm(
            this.els,
            'Delete this folder? Chats inside will be moved to Trash (kept up to 30 days).',
            async () => {
              this.deleteFolder(folderId);
            },
            (v) => (this.state.confirmAction = v)
          );
        } else {
          this.deleteFolder(folderId);
        }
      },
      onOpenChat: (chatId) => {
        this.applySidebarSelection?.({ kind: 'chat', id: chatId });
        this.els.promptInput?.focus();
      },
      onDragStartChat: (e, chatId) => this.dragDropHandler.onDragStartChat(e, chatId),
      onDragStartFolder: (e, folderId) => this.dragDropHandler.onDragStartFolder(e, folderId),
      onRemoveChatFromFolder: (folderId, chatId) => {
        const ok = folderTreeUtils.removeChatFromFolderById(this.state.folders, folderId, chatId);
        if (!ok) return;
        this.saveUIState(this.state);
        this.renderChatsUI();
      },
      onDropOnFolder: (e, targetFolderId) => {
        this.dragDropHandler.handleDropOnFolder(e, targetFolderId);
      },
      onDropOnRoot: (e) => {
        this.dragDropHandler.handleDropOnRoot(e);
      },
      activeChatId
    });
  }

  /**
   * Move chat to a folder or root
   */
  moveChatToFolder(chatId, targetFolderId) {
    this.ensureFoldersInitialized();
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

    const beforeHidden = dbg ? folderTreeUtils.getAllFolderChatIds(this.state.folders) : null;

    if (dbg) {
      try {
        console.debug('[folders] moveChatToFolder', { chatId: id, targetFolderId: folderId });
      } catch {
        // ignore
      }
    }

    folderTreeUtils.removeChatFromAllFolders(this.state.folders, id);

    if (folderId) {
      this.removeChatFromRootList(id);
      const target = folderTreeUtils.findFolder(this.state.folders, folderId);
      if (!target) return;
      if (!Array.isArray(target.chatIds)) target.chatIds = [];
      const exists = target.chatIds.some((x) => (x || '').toString().trim() === id);
      if (!exists) target.chatIds.push(id);
      target.open = true;
    } else {
      this.addChatToRootList(id);
    }

    try {
      window.__ccLastFolders = JSON.parse(JSON.stringify(this.state.folders || []));
    } catch {
      // ignore
    }

    if (dbg) {
      try {
        const afterHidden = folderTreeUtils.getAllFolderChatIds(this.state.folders);
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

    this.saveUIState(this.state);
    this.renderChatsUI();

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

  /**
   * Remove chat from all folders
   */
  removeChatFromFolders(chatId) {
    this.ensureFoldersInitialized();
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

    const beforeHidden = dbg ? folderTreeUtils.getAllFolderChatIds(this.state.folders) : null;

    folderTreeUtils.removeChatFromAllFolders(this.state.folders, id);

    try {
      window.__ccLastFolders = JSON.parse(JSON.stringify(this.state.folders || []));
    } catch {
      // ignore
    }

    if (dbg) {
      try {
        const afterHidden = folderTreeUtils.getAllFolderChatIds(this.state.folders);
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

    this.saveUIState(this.state);
    this.renderChatsUI();
  }

  /**
   * Get flattened list of folders
   */
  getFoldersFlat() {
    this.ensureFoldersInitialized();
    return folderTreeUtils.listFoldersFlat(this.state.folders);
  }

  /**
   * Get set of root chat IDs
   */
  getRootChatIdSet() {
    this.ensureFoldersInitialized();
    return new Set((this.state.rootChatIds || []).map((x) => (x || '').toString().trim()).filter(Boolean));
  }

  /**
   * Get set of all chat IDs (both root and in folders)
   */
  getHiddenChatIdSet() {
    this.ensureFoldersInitialized();
    const out = folderTreeUtils.getAllFolderChatIds(this.state.folders);
    (this.state.rootChatIds || []).forEach((x) => {
      const v = (x || '').toString().trim();
      if (v) out.add(v);
    });
    return out;
  }

  /**
   * Handle drag start from chat list
   */
  onDragStartFromChatList(e, chatId) {
    this.dragDropHandler.onDragStartChat(e, chatId);
  }

  /**
   * Attach all event listeners
   */
  attachListeners() {
    // New folder button
    this.els.foldersNewBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.requestCreateFolder();
      },
      { signal: this.signal }
    );

    // Emoji search input
    this.els.folderEmojiSearchEl?.addEventListener(
      'input',
      () => {
        const query = (this.els.folderEmojiSearchEl?.value || '').toString().trim();
        this.emojiPicker.buildPicker(query);
      },
      { signal: this.signal }
    );

    // Folders header (toggle + drag-drop zone)
    try {
      const headerEl = this.els.foldersToggleBtn?.closest?.('.folders-header');
      let lastHeaderDropAt = 0;

      const onHeaderClick = (e) => {
        const t = e?.target;
        if (!(t instanceof Element)) return;
        if (t.closest?.('#folders-new-btn')) return;
        if (t.closest?.('#folders-toggle-btn')) return;
        if (Date.now() - lastHeaderDropAt < 450) return;
        this.els.foldersToggleBtn?.click();
      };

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
        this.dragDropHandler.handleDropOnRoot(e);
      };

      headerEl?.addEventListener('click', onHeaderClick, { signal: this.signal });
      headerEl?.addEventListener('dragenter', onHeaderDragOver, { capture: true, signal: this.signal });
      headerEl?.addEventListener('dragover', onHeaderDragOver, { capture: true, signal: this.signal });
      headerEl?.addEventListener('drop', onHeaderDrop, { capture: true, signal: this.signal });
    } catch {
      // ignore
    }

    // Create folder modal
    this.els.folderCreateCancelBtn?.addEventListener(
      'click',
      () => {
        this.closeCreateFolderModal();
      },
      { signal: this.signal }
    );

    this.els.folderCreateOkBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.commitCreateFolderFromModal();
      },
      { signal: this.signal }
    );

    this.els.folderCreateModalEl?.addEventListener(
      'click',
      (e) => {
        if (e.target === this.els.folderCreateModalEl) this.closeCreateFolderModal();
      },
      { signal: this.signal }
    );

    this.els.folderCreateInputEl?.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.commitCreateFolderFromModal();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeCreateFolderModal();
        }
      },
      { signal: this.signal }
    );

    // Global escape key for modal
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.folderCreateOpen) {
          e.preventDefault();
          this.closeCreateFolderModal();
        }
      },
      { signal: this.signal }
    );
  }
}

/**
 * uiBindings.js - Refactored UI binding coordinator
 * Orchestrates all UI-related functionality through modular controllers
 *
 * Modules:
 * - FileAttachmentHandler: File operations and PDF extraction
 * - PromptInputController: Prompt input field interactions
 * - ThemeController: Theme and accent management
 * - SidebarController: Trash and memories sidebar
 * - PopoverManager: Hover-based popover behavior
 * - SelectionAskButton: Text selection button feature
 */

import { FileAttachmentHandler } from './uiModules/FileAttachmentHandler.js';
import { PromptInputController } from './uiModules/PromptInputController.js';
import { ThemeController } from './uiModules/ThemeController.js';
import { SidebarController } from './uiModules/SidebarController.js';
import { PopoverManager } from './uiModules/PopoverManager.js';
import { SelectionAskButton } from './uiModules/SelectionAskButton.js';

export function attachUIBindings({
  els,
  state,
  autosizePrompt,
  clampNumber,
  saveUIState,
  closeConfirm,
  closePromptToolsPopover,
  togglePromptToolsPopover,
  closeChatHeaderToolsPopover,
  toggleChatHeaderToolsPopover,
  updateSendButtonEnabled,
  setRandomnessSliderFill,
  setTextSizeSliderFill,
  applyChatTextSize,
  renderChatsUI,
  handleSubmit,
  abortStreaming,
  applySidebarSelection,
  focusDockView,
  onMemoriesSearchInput,
  onMemoriesAdd,
  onMemoriesOpen,
  onTrashSearchInput,
  onTrashRestoreAll,
  onTrashDeleteAll,
  onTrashOpen
}) {
  const bindingsAbort = new AbortController();
  const signal = bindingsAbort.signal;

  // ============================================================================
  // File Attachment Handler
  // ============================================================================
  const renderPromptAttachments = () => {
    fileAttachmentHandler.renderAttachments(els);
  };

  const fileAttachmentHandler = new FileAttachmentHandler({
    state,
    renderCallback: renderPromptAttachments,
    signal
  });

  // Initial render
  fileAttachmentHandler.renderAttachments(els);

  // ============================================================================
  // Prompt Input Controller
  // ============================================================================
  new PromptInputController({
    els,
    state,
    fileAttachmentHandler,
    autosizePrompt,
    updateSendButtonEnabled,
    handleSubmit,
    abortStreaming,
    signal
  });

  // ============================================================================
  // Theme Controller
  // ============================================================================
  new ThemeController({
    els,
    state,
    saveUIState,
    signal
  });

  // ============================================================================
  // Sidebar Controller
  // ============================================================================
  new SidebarController({
    els,
    state,
    applySidebarSelection,
    focusDockView,
    onMemoriesSearchInput,
    onMemoriesAdd,
    onMemoriesOpen,
    onTrashSearchInput,
    onTrashRestoreAll,
    onTrashDeleteAll,
    onTrashOpen,
    signal
  });

  // ============================================================================
  // Popover Managers
  // ============================================================================
  new PopoverManager({
    btn: els.promptToolsBtn,
    popover: els.promptToolsPopover,
    open: () => {
      if (!els.promptToolsPopover || !els.promptToolsBtn) return;
      if (!els.promptToolsPopover.classList.contains('hidden')) return;
      togglePromptToolsPopover();
    },
    close: () => closePromptToolsPopover(),
    signal
  });

  const closePromptInsertPopover = () => {
    if (!els.promptInsertPopover || !els.promptInsertBtn) return;
    els.promptInsertPopover.classList.add('hidden');
    els.promptInsertBtn.setAttribute('aria-expanded', 'false');
  };

  const togglePromptInsertPopover = () => {
    if (!els.promptInsertPopover || !els.promptInsertBtn) return;
    const isOpen = !els.promptInsertPopover.classList.contains('hidden');
    els.promptInsertPopover.classList.toggle('hidden', isOpen);
    els.promptInsertBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  };

  new PopoverManager({
    btn: els.promptInsertBtn,
    popover: els.promptInsertPopover,
    open: () => {
      if (!els.promptInsertPopover || !els.promptInsertBtn) return;
      if (!els.promptInsertPopover.classList.contains('hidden')) return;
      togglePromptInsertPopover();
    },
    close: () => closePromptInsertPopover(),
    signal
  });

  new PopoverManager({
    btn: els.chatHeaderToolsBtn,
    popover: els.chatHeaderToolsPopover,
    open: () => {
      if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
      if (!els.chatHeaderToolsPopover.classList.contains('hidden')) return;
      toggleChatHeaderToolsPopover?.();
    },
    close: () => closeChatHeaderToolsPopover?.(),
    signal
  });

  // ============================================================================
  // Prompt Insert Menu Buttons
  // ============================================================================
  els.promptInsertBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { signal }
  );

  els.promptInsertTextBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePromptInsertPopover();
      els.promptInsertTextInput?.click();
    },
    { signal }
  );

  els.promptInsertImageBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePromptInsertPopover();
      els.promptInsertImageInput?.click();
    },
    { signal }
  );

  els.promptInsertTextInput?.addEventListener(
    'change',
    async () => {
      const file = els.promptInsertTextInput?.files?.[0];
      try {
        if (!file) return;
        await fileAttachmentHandler.classifyAndAttachFile(file);
      } catch {
        // ignore
      } finally {
        try {
          els.promptInsertTextInput.value = '';
        } catch {
          // ignore
        }
      }
    },
    { signal }
  );

  els.promptInsertImageInput?.addEventListener(
    'change',
    async () => {
      const file = els.promptInsertImageInput?.files?.[0];
      try {
        if (!file) return;
        await fileAttachmentHandler.classifyAndAttachFile(file);
      } catch {
        // ignore
      } finally {
        try {
          els.promptInsertImageInput.value = '';
        } catch {
          // ignore
        }
      }
    },
    { signal }
  );

  // ============================================================================
  // Keyboard & Global Event Handlers
  // ============================================================================
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePromptToolsPopover();
      closePromptInsertPopover();
      closeChatHeaderToolsPopover?.();
    }
  });

  document.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (els.promptInsertBtn?.contains(t)) return;
      if (els.promptInsertPopover?.contains(t)) return;
      closePromptInsertPopover();
    },
    { signal }
  );

  // ============================================================================
  // Settings Panel Controls (Sliders)
  // ============================================================================
  if (els.creativitySlider) {
    els.creativitySlider.addEventListener('input', () => {
      state.creativity = clampNumber(els.creativitySlider.value, 0, 2, 1);
      if (els.creativityValue) els.creativityValue.textContent = state.creativity.toFixed(2);
      setRandomnessSliderFill();
      saveUIState(state);
    });
  }

  if (els.textSizeSlider) {
    els.textSizeSlider.addEventListener('input', () => {
      state.textSize = clampNumber(els.textSizeSlider.value, 0.85, 1.25, 1);
      if (els.textSizeValue) els.textSizeValue.textContent = state.textSize.toFixed(2);
      setTextSizeSliderFill?.();
      applyChatTextSize?.();
      saveUIState(state);
    });
  }

  // ============================================================================
  // System Prompt Input
  // ============================================================================
  if (els.systemPromptInput) {
    els.systemPromptInput.addEventListener('input', () => {
      state.systemPrompt = (els.systemPromptInput.value || '').toString();
      saveUIState(state);
    });
  }

  // ============================================================================
  // Chat Search & New Chat Button
  // ============================================================================
  els.chatSearchInput?.addEventListener('input', () => {
    state.chatQuery = (els.chatSearchInput.value || '').trim().toLowerCase();
    saveUIState(state);
    renderChatsUI();
  });

  els.newChatBtn.addEventListener('click', async () => {
    state.pendingNew = true;
    applySidebarSelection({ kind: 'chat', id: null });
    focusDockView?.('chat');
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    els.promptInput.focus();
  });

  // ============================================================================
  // Folder Toggle
  // ============================================================================
  els.foldersToggleBtn?.addEventListener('click', () => {
    state.foldersOpen = !(typeof state.foldersOpen === 'boolean' ? state.foldersOpen : true);
    saveUIState(state);
    renderChatsUI();
  });

  // ============================================================================
  // Confirmation Modal
  // ============================================================================
  els.confirmCancelBtn?.addEventListener('click', () => {
    closeConfirm(els, (v) => (state.confirmAction = v));
  });

  els.confirmOkBtn?.addEventListener('click', async () => {
    const action = state.confirmAction;
    closeConfirm(els, (v) => (state.confirmAction = v));
    if (typeof action === 'function') {
      await action();
    }
  });

  els.confirmModalEl?.addEventListener('click', (e) => {
    if (e.target === els.confirmModalEl) closeConfirm(els, (v) => (state.confirmAction = v));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.confirmModalEl && !els.confirmModalEl.classList.contains('hidden')) {
      closeConfirm(els, (v) => (state.confirmAction = v));
    }
  });

  // ============================================================================
  // Selection Ask Button
  // ============================================================================
  new SelectionAskButton({
    els,
    state,
    fileAttachmentHandler,
    signal
  });

  // ============================================================================
  // Cleanup
  // ============================================================================
  window.addEventListener('beforeunload', () => bindingsAbort.abort());

  return bindingsAbort;
}

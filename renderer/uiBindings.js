export function attachUIBindings({
  els,
  state,
  tempChatId,
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
  togglePinnedOpen,
  togglePinnedChat,
  onMemoriesSearchInput,
  onMemoriesAdd,
  onMemoriesOpen,
  onTrashSearchInput,
  onTrashRestoreAll,
  onTrashDeleteAll,
  onTrashOpen
}) {
  const bindingsAbort = new AbortController();

  window.addEventListener(
    'cc:openMemories',
    (e) => {
      const query = (e?.detail?.query || '').toString().trim();
      focusDockView?.('memories');
      onMemoriesOpen?.();
      if (els.memoriesSearchInput) {
        els.memoriesSearchInput.value = query;
        els.memoriesSearchInput.focus();
      }
      state.memoriesQuery = query.toLowerCase();
      onMemoriesSearchInput?.();
    },
    { signal: bindingsAbort.signal }
  );

  window.addEventListener(
    'cc:togglePinnedChat',
    async (e) => {
      const id = e?.detail?.id;
      if (typeof id !== 'string' || !id) return;
      if (id === tempChatId) return;
      await togglePinnedChat?.(id);
    },
    { signal: bindingsAbort.signal }
  );

  window.addEventListener('beforeunload', () => bindingsAbort.abort(), { signal: bindingsAbort.signal });

  els.promptForm.addEventListener('submit', handleSubmit);
  els.promptInput.addEventListener('input', () => {
    autosizePrompt(els.promptInput);
    updateSendButtonEnabled();
  });
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  });

  els.sendBtn?.addEventListener('click', (e) => {
    if (!state.isStreaming) return;
    e.preventDefault();
    e.stopPropagation();
    abortStreaming?.();
  });

  const attachHoverPopover = ({ btn, popover, open, close }) => {
    let closeTimer = null;

    const clearCloseTimer = () => {
      if (!closeTimer) return;
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const scheduleClose = () => {
      clearCloseTimer();
      closeTimer = setTimeout(() => {
        close();
      }, 150);
    };

    btn?.addEventListener('mouseenter', () => {
      clearCloseTimer();
      open();
    });
    btn?.addEventListener('mouseleave', () => {
      scheduleClose();
    });

    popover?.addEventListener('mouseenter', () => {
      clearCloseTimer();
      open();
    });
    popover?.addEventListener('mouseleave', () => {
      scheduleClose();
    });
  };

  attachHoverPopover({
    btn: els.promptToolsBtn,
    popover: els.promptToolsPopover,
    open: () => {
      if (!els.promptToolsPopover || !els.promptToolsBtn) return;
      if (!els.promptToolsPopover.classList.contains('hidden')) return;
      togglePromptToolsPopover();
    },
    close: () => closePromptToolsPopover()
  });

  attachHoverPopover({
    btn: els.chatHeaderToolsBtn,
    popover: els.chatHeaderToolsPopover,
    open: () => {
      if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
      if (!els.chatHeaderToolsPopover.classList.contains('hidden')) return;
      toggleChatHeaderToolsPopover?.();
    },
    close: () => closeChatHeaderToolsPopover?.()
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePromptToolsPopover();
      closeChatHeaderToolsPopover?.();
    }
  });

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

  if (els.systemPromptInput) {
    els.systemPromptInput.addEventListener('input', () => {
      state.systemPrompt = (els.systemPromptInput.value || '').toString();
      saveUIState(state);
    });
  }

  els.chatSearchInput?.addEventListener('input', () => {
    state.chatQuery = (els.chatSearchInput.value || '').trim().toLowerCase();
    saveUIState(state);
    renderChatsUI();
  });

  els.newChatBtn.addEventListener('click', async () => {
    state.pendingNew = true;
    applySidebarSelection({ kind: 'chat', id: null });
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    els.promptInput.focus();
  });

  els.trashBtn?.addEventListener('click', () => {
    focusDockView?.('trash');
    onTrashOpen?.();
    if (els.trashSearchInput) els.trashSearchInput.focus();
    els.trashBtn?.classList.add('active');
    els.memoriesBtn?.classList.remove('active');
  });

  els.memoriesBtn?.addEventListener('click', () => {
    focusDockView?.('memories');
    onMemoriesOpen?.();
    if (els.memoriesSearchInput) els.memoriesSearchInput.focus();
    els.memoriesBtn?.classList.add('active');
    els.trashBtn?.classList.remove('active');
  });

  els.pinnedBtn?.addEventListener('click', () => {
    togglePinnedOpen?.();
  });

  els.trashSearchInput?.addEventListener('input', () => {
    state.trashQuery = (els.trashSearchInput.value || '').trim().toLowerCase();
    onTrashSearchInput?.();
  });

  els.memoriesSearchInput?.addEventListener('input', () => {
    state.memoriesQuery = (els.memoriesSearchInput.value || '').trim().toLowerCase();
    onMemoriesSearchInput?.();
  });

  const runAddMemory = async () => {
    const v = (els.memoriesAddInput?.value || '').toString().trim();
    if (!v) return;
    els.memoriesAddInput.value = '';
    await onMemoriesAdd?.(v);
  };

  els.memoriesAddBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await runAddMemory();
  });

  els.memoriesAddInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await runAddMemory();
    }
  });

  els.trashRestoreAllBtn?.addEventListener('click', async () => {
    await onTrashRestoreAll?.();
  });

  els.trashDeleteAllBtn?.addEventListener('click', async () => {
    await onTrashDeleteAll?.();
  });

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
}

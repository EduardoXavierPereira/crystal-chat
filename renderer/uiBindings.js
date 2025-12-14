export function attachUIBindings({
  els,
  state,
  autosizePrompt,
  clampNumber,
  saveUIState,
  closeConfirm,
  closePromptToolsPopover,
  togglePromptToolsPopover,
  updateSendButtonEnabled,
  setRandomnessSliderFill,
  renderChatsUI,
  handleSubmit,
  abortStreaming,
  applySidebarSelection,
  togglePinnedOpen,
  onTrashSearchInput,
  onTrashRestoreAll,
  onTrashDeleteAll
}) {
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

  els.promptToolsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePromptToolsPopover();
  });

  document.addEventListener('click', (e) => {
    if (!els.promptToolsPopover || els.promptToolsPopover.classList.contains('hidden')) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (els.promptToolsPopover.contains(t)) return;
    if (els.promptToolsBtn && els.promptToolsBtn.contains(t)) return;
    closePromptToolsPopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePromptToolsPopover();
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
    const nextKind = state.sidebarSelection.kind === 'trash' ? 'chat' : 'trash';
    if (nextKind === 'trash') {
      applySidebarSelection({ kind: 'trash' });
      if (els.trashSearchInput) els.trashSearchInput.focus();
    } else {
      applySidebarSelection({ kind: 'chat', id: null });
      els.promptInput?.focus();
    }
  });

  els.pinnedBtn?.addEventListener('click', () => {
    togglePinnedOpen?.();
  });

  els.trashSearchInput?.addEventListener('input', () => {
    state.trashQuery = (els.trashSearchInput.value || '').trim().toLowerCase();
    onTrashSearchInput?.();
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

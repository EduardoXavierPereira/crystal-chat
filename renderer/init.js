export async function runInit({
  els,
  MODEL,
  setSetupRetryEnabled,
  getSetupSucceeded,
  ensureOllamaAndModel,
  hideSetupModal,
  hideError,
  showSetupModal,
  showError,
  continueInitAfterSetup,
  updateSendButtonEnabled,
  setRuntimeApiUrl,
  getRuntimeApiUrl
}) {
  if (els.statusEl) els.statusEl.textContent = `Model: ${MODEL} (Ollama)`;

  // Retry should only be enabled when setup fails.
  setSetupRetryEnabled(false);

  try {
    const api = window.electronAPI;
    if (api?.ollamaGetApiUrl) {
      const r = await api.ollamaGetApiUrl();
      setRuntimeApiUrl(r?.apiUrl || null);
      if (getRuntimeApiUrl() && els.statusEl) {
        els.statusEl.textContent = `Model: ${MODEL} (Ollama @ ${r?.host || 'local'})`;
      }
    }
  } catch {
    setRuntimeApiUrl(null);
  }

  if (els.setupCloseBtn) {
    els.setupCloseBtn.addEventListener('click', async () => {
      if (!getSetupSucceeded()) return;
      hideSetupModal();
      hideError(els.errorEl);
      await continueInitAfterSetup();
    });
  }

  if (els.setupRetryBtn) {
    els.setupRetryBtn.addEventListener('click', async () => {
      setSetupRetryEnabled(false);
      try {
        await ensureOllamaAndModel();
        hideError(els.errorEl);
        hideSetupModal();
        await continueInitAfterSetup();
      } catch (e) {
        showSetupModal('Setup failed.');
        showError(els.errorEl, e?.message || 'Setup failed.');
        setSetupRetryEnabled(true);
      }
    });
  }

  try {
    const style = document.createElement('style');
    document.head.appendChild(style);
    style.sheet.insertRule('*::-webkit-scrollbar{width:8px}', 0);
    style.remove();
    console.log('[scrollbar] ::-webkit-scrollbar supported');
  } catch (e) {
    console.warn('[scrollbar] ::-webkit-scrollbar NOT supported/ignored by this build', e);
  }

  try {
    await ensureOllamaAndModel();
    hideSetupModal();
    await continueInitAfterSetup();
  } catch (e) {
    showSetupModal('Setup failed.');
    showError(els.errorEl, e?.message || 'Setup failed.');
    setSetupRetryEnabled(true);
    return;
  }

  updateSendButtonEnabled();
}

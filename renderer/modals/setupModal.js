/**
 * Setup modal UI management
 */

export function createSetupModal(els, setupController) {
  return {
    show(message) {
      if (!els.setupModalEl) return;
      els.setupModalEl.classList.remove('hidden');
      if (els.setupMessageEl) els.setupMessageEl.textContent = (message || '').toString();
      if (els.setupCloseBtn) {
        els.setupCloseBtn.disabled = !(setupController?.getSetupSucceeded?.() ?? false);
      }
    },

    hide() {
      if (!els.setupModalEl) return;
      els.setupModalEl.classList.add('hidden');
    },

    setRetryEnabled(enabled) {
      if (!els.setupRetryBtn) return;
      els.setupRetryBtn.disabled = !enabled;
    },

    appendLogLine(line) {
      if (els.setupMessageEl) {
        const current = (els.setupMessageEl.textContent || '').toString();
        els.setupMessageEl.textContent = current ? current + '\n' + line : line;
      }
    }
  };
}

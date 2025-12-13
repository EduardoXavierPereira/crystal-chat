export function autosizePrompt(promptInput) {
  if (!promptInput) return;
  const styles = window.getComputedStyle(promptInput);
  const maxHeight = parseFloat(styles.maxHeight) || Infinity;
  promptInput.style.height = 'auto';
  const next = Math.min(promptInput.scrollHeight, maxHeight);
  promptInput.style.height = `${next}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function showError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

export function hideError(errorEl) {
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
}

export function openConfirm(els, message, onConfirm, setConfirmAction) {
  setConfirmAction(onConfirm);
  if (els.confirmMessageEl) els.confirmMessageEl.textContent = message;
  els.confirmModalEl?.classList.remove('hidden');
  els.confirmCancelBtn?.focus();
}

export function closeConfirm(els, setConfirmAction) {
  setConfirmAction(null);
  els.confirmModalEl?.classList.add('hidden');
}

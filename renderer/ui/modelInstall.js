/**
 * Model installation UI management
 */

export function createModelInstallUI(els) {
  return {
    setUI({ visible, label, percent }) {
      if (els.modelInstallEl) {
        els.modelInstallEl.classList.toggle('hidden', !visible);
      }
      if (els.modelInstallLabelEl) {
        els.modelInstallLabelEl.textContent = (label || '').toString();
      }
      const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
      if (els.modelInstallPercentEl) {
        els.modelInstallPercentEl.textContent = `${Math.round(p)}%`;
      }
      if (els.modelInstallBarFillEl) {
        els.modelInstallBarFillEl.style.width = `${p}%`;
      }
    }
  };
}

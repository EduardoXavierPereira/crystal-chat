/**
 * Update modal UI management for electron-updater
 */

import { releaseNotesToPlainText } from '../utils/releaseNotes.js';

export function createUpdateModal(els) {
  let updateModalShown = false;

  return {
    show(payload) {
      if (!els.updateModalEl) return;
      if (updateModalShown) return;
      updateModalShown = true;

      const version = payload?.version ? `v${payload.version}` : '';
      const name = (payload?.releaseName || '').toString().trim();
      const title = name || version || 'A new version is available.';

      if (els.updateMessageEl) {
        const lines = [];
        lines.push(title);
        const notes = releaseNotesToPlainText(payload?.releaseNotes);
        if (typeof notes === 'string' && notes.trim()) {
          lines.push('');
          lines.push(notes.trim());
        }
        els.updateMessageEl.textContent = lines.join('\n');
      }

      if (els.updateRestartBtn) {
        els.updateRestartBtn.disabled = false;
        els.updateRestartBtn.textContent = 'Restart and update';
      }

      els.updateModalEl.classList.remove('hidden');
      els.updateLaterBtn?.focus?.();
    },

    hide() {
      if (els.updateModalEl) els.updateModalEl.classList.add('hidden');
    },

    attachBindings(electronAPI) {
      if (!electronAPI?.onUpdateAvailable) return;

      electronAPI.onUpdateAvailable((payload) => {
        this.show(payload);
      });

      electronAPI.onUpdateProgress?.((progress) => {
        if (!els.updateModalEl || els.updateModalEl.classList.contains('hidden')) return;
        const pct = Number(progress?.percent);
        if (!Number.isFinite(pct)) return;
        if (els.updateRestartBtn) {
          els.updateRestartBtn.disabled = true;
          els.updateRestartBtn.textContent = `Downloading… ${Math.round(Math.max(0, Math.min(100, pct)))}%`;
        }
      });

      electronAPI.onUpdateDownloaded?.(() => {
        if (els.updateRestartBtn) {
          els.updateRestartBtn.disabled = false;
          els.updateRestartBtn.textContent = 'Restart and update';
        }
      });

      electronAPI.onUpdateError?.(() => {
        if (els.updateRestartBtn) {
          els.updateRestartBtn.disabled = false;
          els.updateRestartBtn.textContent = 'Restart and update';
        }
      });

      els.updateLaterBtn?.addEventListener('click', () => {
        this.hide();
      });

      els.updateRestartBtn?.addEventListener('click', async () => {
        if (!electronAPI?.restartAndUpdate) return;
        try {
          if (els.updateRestartBtn) {
            els.updateRestartBtn.disabled = true;
            els.updateRestartBtn.textContent = 'Preparing update…';
          }
          await electronAPI.restartAndUpdate();
        } catch {
          if (els.updateRestartBtn) {
            els.updateRestartBtn.disabled = false;
            els.updateRestartBtn.textContent = 'Restart and update';
          }
        }
      });

      els.updateModalEl?.addEventListener('click', (e) => {
        if (e.target === els.updateModalEl) this.hide();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.updateModalEl && !els.updateModalEl.classList.contains('hidden')) {
          this.hide();
        }
      });
    }
  };
}

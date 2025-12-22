/**
 * Theme and appearance management
 */

import { wrapLogged } from '../errorHandler.js';

export function createThemeManager(state) {
  return {
    applyThemeAndAccent() {
      const resolveTheme = () => {
        const raw = (state?.theme || 'system').toString();
        if (raw === 'dark' || raw === 'light') return raw;
        if (raw !== 'system') return 'dark';
        return wrapLogged(() => {
          return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
        }, 'detect system color scheme') || 'dark';
      };

      wrapLogged(() => {
        document.documentElement.dataset.theme = resolveTheme();
      }, 'apply theme to document');

      wrapLogged(() => {
        const accent = (state?.accent || '#7fc9ff').toString();
        document.documentElement.style.setProperty('--accent', accent);
      }, 'apply accent color');
    },

    applyReadOnlyMode(els) {
      const isReadOnly = !!state.readOnlyMode;

      // Hide/show prompt form
      if (els.promptForm) {
        els.promptForm.classList.toggle('hidden', isReadOnly);
      }

      // Hide/show all message action buttons
      if (els.messagesEl) {
        const actions = els.messagesEl.querySelectorAll('.message-actions');
        actions.forEach(el => {
          el.classList.toggle('hidden', isReadOnly);
        });
      }
    }
  };
}

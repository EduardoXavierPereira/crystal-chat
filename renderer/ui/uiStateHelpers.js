/**
 * UI state update helpers - update various UI elements based on app state
 */

import { clampNumber } from '../utils/clamp.js';
import { formatModelName } from '../formatModelName.js';

export function createUIStateHelpers(els, state, getRuntimeApiUrl) {
  return {
    updateStatusText() {
      if (!els.statusEl) return;
      const runtimeApiUrl = getRuntimeApiUrl();
      const m = (state.selectedModel || 'default').toString();
      const label = formatModelName(m) || m;
      const host = runtimeApiUrl ? ` @ ${new URL(runtimeApiUrl).host}` : '';
      els.statusEl.textContent = `Model: ${label} (Ollama${host})`;
    },

    updatePromptPlaceholder() {
      if (!els.promptInput) return;
      const m = (state.selectedModel || 'default').toString();
      const label = formatModelName(m) || m;
      const internetHint = state.enableInternet ? ' (Internet on)' : '';
      els.promptInput.placeholder = `Message ${label}${internetHint}`;
    },

    updateSendButtonEnabled() {
      if (!els.sendBtn || !els.promptInput) return;
      // While streaming, the send button acts as a pause/cancel control.
      if (state.isStreaming) {
        els.sendBtn.disabled = false;
        return;
      }
      const hasText = !!(els.promptInput.value || '').toString().trim();
      const hasAttachments =
        (Array.isArray(state.pendingImages) && state.pendingImages.length > 0)
        || (Array.isArray(state.pendingFiles) && state.pendingFiles.length > 0)
        || !!state.pendingTextFile;
      els.sendBtn.disabled = !(hasText || hasAttachments);
    },

    setRandomnessSliderFill() {
      if (!els.creativitySlider) return;
      const min = clampNumber(els.creativitySlider.min, 0, 2, 0);
      const max = clampNumber(els.creativitySlider.max, 0, 2, 2);
      const v = clampNumber(els.creativitySlider.value, min, max, 1);
      const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
      els.creativitySlider.style.setProperty('--range-pct', `${pct}%`);
    },

    setTextSizeSliderFill() {
      if (!els.textSizeSlider) return;
      const min = clampNumber(els.textSizeSlider.min, 0.5, 2, 1);
      const max = clampNumber(els.textSizeSlider.max, 0.5, 2, 1);
      const v = clampNumber(els.textSizeSlider.value, min, max, 1);
      const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
      els.textSizeSlider.style.setProperty('--range-pct', `${pct}%`);
    },

    applyChatTextSize() {
      if (!els.messagesEl) return;
      const v = Number.isFinite(state.textSize) ? state.textSize : 1;
      els.messagesEl.style.setProperty('--chat-text-scale', String(v));
    }
  };
}

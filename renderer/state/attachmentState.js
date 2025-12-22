/**
 * Pending attachment state management
 */

export function createAttachmentState(state, els) {
  return {
    clear() {
      state.pendingImages = [];
      state.pendingTextFile = null;
      state.pendingFiles = [];
      els.promptInsertBtn?.classList.remove('has-attachment');
      if (els.promptAttachmentsEl) {
        els.promptAttachmentsEl.innerHTML = '';
        els.promptAttachmentsEl.classList.add('hidden');
      }
    },

    getPendingImages() {
      return Array.isArray(state?.pendingImages) ? state.pendingImages : [];
    },

    getPendingTextFile() {
      return state?.pendingTextFile || null;
    },

    getPendingFiles() {
      return Array.isArray(state?.pendingFiles) ? state.pendingFiles : [];
    }
  };
}

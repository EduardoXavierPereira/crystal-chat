/**
 * Draft Manager - Handles auto-save of a single floating message draft
 * The draft persists across chat switches until explicitly cleared
 */

const DRAFT_STORAGE_KEY = 'crystal-chat:active-draft';

/**
 * Save the active draft
 * @param {string} content - Draft content
 */
export function saveDraft(content) {
  try {
    const trimmed = (content || '').toString().trim();
    if (trimmed) {
      localStorage.setItem(DRAFT_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Get the active draft
 * @returns {string} Draft content or empty string
 */
export function getDraft() {
  try {
    const draft = localStorage.getItem(DRAFT_STORAGE_KEY) || '';
    return draft;
  } catch {
    return '';
  }
}

/**
 * Clear the active draft
 */
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

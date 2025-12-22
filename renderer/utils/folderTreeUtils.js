/**
 * Pure utility functions for folder tree operations
 * No dependencies on state, DOM, or other modules
 */

/**
 * Generate a unique ID for folders
 */
export function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `f_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

/**
 * Recursively traverse folder tree
 * @param {Array} folders - Folder array
 * @param {Function} fn - Callback for each folder
 */
export function visitFolders(folders, fn) {
  (folders || []).forEach((f) => {
    fn(f);
    visitFolders(f.folders || [], fn);
  });
}

/**
 * Find a folder by ID in the tree
 * @param {Array} folders - Folder array
 * @param {string} id - Folder ID to find
 * @returns {Object|null} The folder object or null
 */
export function findFolder(folders, id) {
  let found = null;
  visitFolders(folders, (f) => {
    if (found) return;
    if (f.id === id) found = f;
  });
  return found;
}

/**
 * Remove a folder and all its contents from the tree
 * @param {Array} folders - Folder array
 * @param {string} id - Folder ID to remove
 * @returns {Object|null} The removed folder or null
 */
export function removeFolderById(folders, id) {
  if (!Array.isArray(folders)) return null;
  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    if (f?.id === id) {
      folders.splice(i, 1);
      return f;
    }
    const removed = removeFolderById(f?.folders || [], id);
    if (removed) return removed;
  }
  return null;
}

/**
 * Check if a folder ID is a descendant of another
 * @param {Object} rootFolder - Root folder to check within
 * @param {string} maybeChildId - Potential child folder ID
 * @returns {boolean}
 */
export function isDescendantFolderId(rootFolder, maybeChildId) {
  if (!rootFolder || !maybeChildId) return false;
  let hit = false;
  visitFolders(rootFolder.folders || [], (f) => {
    if (f.id === maybeChildId) hit = true;
  });
  return hit;
}

/**
 * Remove a chat from all folders in the tree
 * @param {Array} folders - Folder array
 * @param {string} chatId - Chat ID to remove
 */
export function removeChatFromAllFolders(folders, chatId) {
  visitFolders(folders, (f) => {
    if (!Array.isArray(f.chatIds)) return;
    const wanted = (chatId || '').toString().trim();
    if (!wanted) return;
    const dbg = (() => {
      try {
        return !!window.__ccDebugFolders;
      } catch {
        return false;
      }
    })();
    // Remove all occurrences to avoid duplicates keeping the chat hidden.
    for (let i = f.chatIds.length - 1; i >= 0; i--) {
      if ((f.chatIds[i] || '').toString().trim() === wanted) {
        if (dbg) {
          try {
            console.debug('[folders] removeChatFromAllFolders', { folderId: f.id, chatId: wanted });
          } catch {
            // ignore
          }
        }
        f.chatIds.splice(i, 1);
      }
    }
  });
}

/**
 * Remove a chat from a specific folder
 * @param {Array} folders - Folder array
 * @param {string} folderId - Folder ID
 * @param {string} chatId - Chat ID to remove
 * @returns {boolean} True if removed
 */
export function removeChatFromFolderById(folders, folderId, chatId) {
  const folder = findFolder(folders, folderId);
  if (!folder || !Array.isArray(folder.chatIds)) return false;
  const wanted = (chatId || '').toString().trim();
  if (!wanted) return false;
  let removed = false;
  for (let i = folder.chatIds.length - 1; i >= 0; i--) {
    if ((folder.chatIds[i] || '').toString().trim() === wanted) {
      folder.chatIds.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

/**
 * Get all chat IDs in folders
 * @param {Array} folders - Folder array
 * @returns {Set} Set of chat IDs
 */
export function getAllFolderChatIds(folders) {
  const out = new Set();
  visitFolders(folders, (f) => {
    (f.chatIds || []).forEach((id) => {
      const v = (id || '').toString().trim();
      if (v) out.add(v);
    });
  });
  return out;
}

/**
 * Flatten folder tree to a list with depth information
 * @param {Array} folders - Folder array
 * @returns {Array} List of {id, name, depth}
 */
export function listFoldersFlat(folders) {
  const out = [];
  const walk = (arr, depth) => {
    (arr || []).forEach((f) => {
      if (!f) return;
      out.push({ id: f.id, name: (f.name || 'Folder').toString(), depth: depth || 0 });
      walk(f.folders || [], (depth || 0) + 1);
    });
  };
  walk(folders, 0);
  return out;
}

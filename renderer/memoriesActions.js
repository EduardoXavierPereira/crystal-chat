import { renderMemories } from './memoriesView.js';
import { addMemory, getMemoryDisplayParts, updateMemory } from './memories.js';

function loadAllMemories(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('memories', 'readonly');
    const store = tx.objectStore('memories');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deleteMemory(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('memories', 'readwrite');
    const store = tx.objectStore('memories');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function clearAllMemories(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('memories', 'readwrite');
    const store = tx.objectStore('memories');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function importMemoriesFromJSON(db, fileContent) {
  try {
    const data = JSON.parse(fileContent);
    if (!data.memories || !Array.isArray(data.memories)) {
      throw new Error('Invalid memories file format');
    }
    return data;
  } catch (e) {
    throw new Error(`Failed to parse memories file: ${e.message}`);
  }
}

async function exportMemoriesAsJSON(db) {
  try {
    const allMemories = await loadAllMemories(db);
    const exportData = {
      exportDate: new Date().toISOString(),
      count: allMemories.length,
      memories: allMemories.map(m => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        lastRetrievedAt: m.lastRetrievedAt
      }))
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const dateStr = new Date().toISOString().split('T')[0];
    const defaultFileName = `memories-${dateStr}.json`;

    // Show save dialog
    const result = await window.electronAPI.showSaveDialog({
      title: 'Export Memories',
      defaultPath: defaultFileName,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      throw new Error('Export canceled');
    }

    // Write to selected location
    await window.electronAPI.fileWrite(result.filePath, jsonStr);
  } catch (e) {
    if (e.message !== 'Export canceled') {
      throw e;
    }
    // Silently handle user cancellation
  }
}

export function createMemoriesActions({
  db,
  els,
  state,
  getApiUrl,
  embedText,
  embeddingModel,
  showError
}) {
  let editingId = null;

  const closeMemoryEditModal = () => {
    editingId = null;
    els.memoryEditModalEl?.classList.add('hidden');
  };

  const openMemoryEditModal = ({ id, text }) => {
    if (!els.memoryEditModalEl || !els.memoryEditInputEl) return false;
    editingId = id;
    els.memoryEditInputEl.value = (text || '').toString();
    els.memoryEditModalEl.classList.remove('hidden');
    requestAnimationFrame(() => els.memoryEditInputEl?.focus());
    return true;
  };

  const ensureMemoryEditModalBindings = (() => {
    let wired = false;
    return () => {
      if (wired) return;
      wired = true;

      els.memoryEditCancelBtn?.addEventListener('click', () => {
        closeMemoryEditModal();
      });

      els.memoryEditModalEl?.addEventListener('click', (e) => {
        if (e.target === els.memoryEditModalEl) closeMemoryEditModal();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.memoryEditModalEl && !els.memoryEditModalEl.classList.contains('hidden')) {
          e.preventDefault();
          closeMemoryEditModal();
        }
      });
    };
  })();

  async function renderMemoriesUI() {
    const all = await loadAllMemories(db);
    renderMemories({
      els,
      memories: all,
      query: state.memoriesQuery,
      onDelete: deleteMemoryPermanently,
      onEdit: editMemory
    });
  }

  async function deleteMemoryPermanently(id) {
    if (!id) return;
    await deleteMemory(db, id);
    await renderMemoriesUI();
    try {
      window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'delete' } }));
    } catch {
      // ignore
    }
  }

  async function editMemory(memory) {
    const id = memory?.id;
    if (!id) return;

    const parts = getMemoryDisplayParts?.(memory) || { text: (memory?.text || '').toString() };
    const currentText = (parts.text || '').toString();

    ensureMemoryEditModalBindings();
    const opened = openMemoryEditModal({ id, text: currentText });
    if (!opened) return;

    const save = async () => {
      const liveId = editingId;
      if (!liveId) return;
      const nextText = (els.memoryEditInputEl?.value || '').toString().trim();
      if (!nextText) return;

      const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
      const model = (embeddingModel || '').toString().trim();
      if (!embedText || !model) return;

      try {
        els.memoryEditSaveBtn?.setAttribute('disabled', 'true');
        const emb = await embedText({ apiUrl, model, text: nextText });
        await updateMemory(db, { id: liveId, text: nextText, embedding: emb, updatedAt: Date.now() });
        closeMemoryEditModal();
        await renderMemoriesUI();
        try {
          window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'edit' } }));
        } catch {
          // ignore
        }
      } catch (e) {
        showError?.(els.errorEl, e?.message || 'Failed to edit memory.');
      } finally {
        els.memoryEditSaveBtn?.removeAttribute('disabled');
      }
    };

    if (els.memoryEditSaveBtn) {
      els.memoryEditSaveBtn.onclick = (e) => {
        e.preventDefault();
        void save();
      };
    }

    if (els.memoryEditInputEl) {
      els.memoryEditInputEl.onkeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void save();
        }
      };
    }
  }

  async function addMemoryFromText(text) {
    const t = (text || '').toString().trim();
    if (!t) return;
    const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
    const model = (embeddingModel || '').toString().trim();
    if (!embedText || !model) return;

    try {
      els.memoriesAddBtn?.setAttribute('disabled', 'true');
      const emb = await embedText({ apiUrl, model, text: t });
      await addMemory(db, { text: t, embedding: emb, createdAt: Date.now() });
      await renderMemoriesUI();
      try {
        window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'add' } }));
      } catch {
        // ignore
      }
    } catch (e) {
      showError?.(els.errorEl, e?.message || 'Failed to add memory.');
    } finally {
      els.memoriesAddBtn?.removeAttribute('disabled');
    }
  }

  async function exportMemories() {
    try {
      els.memoriesExportBtn?.setAttribute('disabled', 'true');
      await exportMemoriesAsJSON(db);
    } catch (e) {
      const errMsg = e?.message || 'Failed to export memories.';
      if (errMsg !== 'Export canceled') {
        showError?.(els.errorEl, errMsg);
      }
    } finally {
      els.memoriesExportBtn?.removeAttribute('disabled');
    }
  }

  async function importMemories() {
    try {
      els.memoriesImportBtn?.setAttribute('disabled', 'true');
      els.memoriesImportInput?.click();
    } catch (e) {
      showError?.(els.errorEl, e?.message || 'Failed to open file dialog.');
    } finally {
      els.memoriesImportBtn?.removeAttribute('disabled');
    }
  }

  async function handleImportFile(file) {
    try {
      els.memoriesImportBtn?.setAttribute('disabled', 'true');
      const fileContent = await file.text();
      const importData = await importMemoriesFromJSON(db, fileContent);
      const existingMemories = await loadAllMemories(db);

      // Show confirmation dialog with options
      state.importPendingData = {
        file,
        importData,
        existingCount: existingMemories.length,
        importCount: importData.memories.length
      };

      // Dispatch event to show import confirmation dialog
      window.dispatchEvent(new CustomEvent('cc:showImportConfirmation', {
        detail: {
          existingCount: existingMemories.length,
          importCount: importData.memories.length
        }
      }));
    } catch (e) {
      showError?.(els.errorEl, e?.message || 'Failed to import memories.');
    } finally {
      els.memoriesImportBtn?.removeAttribute('disabled');
      // Reset file input
      if (els.memoriesImportInput) {
        els.memoriesImportInput.value = '';
      }
    }
  }

  async function completeImport(mode) {
    try {
      const { importData } = state.importPendingData || {};
      if (!importData) return;

      // Clear existing memories if override mode
      if (mode === 'override') {
        await clearAllMemories(db);
      }

      // Add memories from import
      const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
      const model = (embeddingModel || '').toString().trim();

      for (const mem of importData.memories) {
        const memText = (mem.text || '').toString().trim();
        if (!memText) continue;

        try {
          let embedding;
          if (embedText && model) {
            embedding = await embedText({ apiUrl, model, text: memText });
          }

          await addMemory(db, {
            text: memText,
            embedding,
            createdAt: mem.createdAt || Date.now(),
            updatedAt: mem.updatedAt,
            lastRetrievedAt: mem.lastRetrievedAt
          });
        } catch (e) {
          console.error('Failed to add imported memory:', e);
          // Continue with next memory
        }
      }

      state.importPendingData = null;
      await renderMemoriesUI();
      try {
        window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'import' } }));
      } catch {
        // ignore
      }
    } catch (e) {
      showError?.(els.errorEl, e?.message || 'Failed to complete import.');
    }
  }

  return {
    renderMemoriesUI,
    deleteMemoryPermanently,
    addMemoryFromText,
    editMemory,
    exportMemories,
    importMemories,
    handleImportFile,
    completeImport
  };
}

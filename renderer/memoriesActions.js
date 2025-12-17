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

  return {
    renderMemoriesUI,
    deleteMemoryPermanently,
    addMemoryFromText,
    editMemory
  };
}

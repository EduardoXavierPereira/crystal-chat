import { renderMemories } from './memoriesView.js';
import { addMemory } from './memories.js';

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
  async function renderMemoriesUI() {
    const all = await loadAllMemories(db);
    renderMemories({
      els,
      memories: all,
      query: state.memoriesQuery,
      onDelete: deleteMemoryPermanently
    });
  }

  async function deleteMemoryPermanently(id) {
    if (!id) return;
    await deleteMemory(db, id);
    await renderMemoriesUI();
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
    } catch (e) {
      showError?.(els.errorEl, e?.message || 'Failed to add memory.');
    } finally {
      els.memoriesAddBtn?.removeAttribute('disabled');
    }
  }

  return {
    renderMemoriesUI,
    deleteMemoryPermanently,
    addMemoryFromText
  };
}

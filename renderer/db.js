export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('crystal-chat', 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export function loadChats(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const store = tx.objectStore('chats');
    const req = store.getAll();
    req.onsuccess = () => {
      const sorted = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const active = sorted.filter((c) => !c.deletedAt);
      resolve(active);
    };
    req.onerror = () => reject(req.error);
  });
}

export function saveChat(db, chat) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    const req = store.put(chat);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function loadTrashedChats(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const store = tx.objectStore('chats');
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || [])
        .filter((c) => !!c.deletedAt)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export function deleteChat(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function purgeExpiredTrashedChats(db, retentionMs) {
  const now = Date.now();
  const trashed = await loadTrashedChats(db);
  const expired = trashed.filter((c) => (c.deletedAt || 0) + retentionMs <= now);
  if (expired.length === 0) return;
  await Promise.all(expired.map((c) => deleteChat(db, c.id)));
}

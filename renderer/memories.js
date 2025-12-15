export const DEFAULT_EMBEDDING_MODEL = 'embeddinggemma';

function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

function normalizeTextForMemory(s) {
  const t = (s || '').toString().trim();
  if (!t) return '';
  return t.length > 600 ? t.slice(0, 600) : t;
}

export function formatUserPromptMemory({ prompt, now }) {
  const ts = new Date(now || Date.now()).toISOString();
  const clipped = normalizeTextForMemory(prompt);
  return `User said at ${ts}: ${clipped}`;
}

export function addMemory(db, { text, embedding, createdAt }) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const e = Array.from(embedding || []);
    const memory = {
      id,
      text: (text || '').toString(),
      embedding: e,
      createdAt: createdAt || Date.now()
    };

    const tx = db.transaction('memories', 'readwrite');
    const store = tx.objectStore('memories');
    const req = store.put(memory);
    req.onsuccess = () => resolve(memory);
    req.onerror = () => reject(req.error);
  });
}

function getAllMemories(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('memories', 'readonly');
    const store = tx.objectStore('memories');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function findSimilarMemories(db, { queryEmbedding, topK = 5 }) {
  const qe = Array.from(queryEmbedding || []);
  if (!qe.length) return [];

  const all = await getAllMemories(db);
  const scored = [];
  for (const m of all) {
    if (!m || !m.id) continue;
    const emb = Array.isArray(m.embedding) ? m.embedding : [];
    const score = cosineSimilarity(qe, emb);
    scored.push({ memory: m, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, topK)).map((x) => x.memory);
}

export function renderMemoriesBlock(memories, { maxChars = Infinity } = {}) {
  const header = 'Relevant memories (verbatim user prompts):\n';
  const budget = Number.isFinite(maxChars) ? Math.max(0, maxChars) : Infinity;
  if (!budget) return { block: '', usedChars: 0, count: 0 };

  // Budget applies to the entire block.
  let used = 0;
  let count = 0;
  let body = '';

  const items = (memories || []).filter((m) => m && m.text);
  for (const m of items) {
    const line = `- ${m.text}`;
    const prefix = body ? '\n' : '';
    const nextBody = `${body}${prefix}${line}`;
    const nextBlock = `${header}${nextBody}`;

    if (nextBlock.length > budget) {
      // If nothing fits beyond the header, just return empty.
      break;
    }

    body = nextBody;
    count += 1;
    used = nextBlock.length;
  }

  if (!count) return { block: '', usedChars: 0, count: 0 };
  return { block: `${header}${body}`, usedChars: used, count };
}

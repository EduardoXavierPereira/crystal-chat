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

function parseLegacyMemoryText(text) {
  const t = (text || '').toString();
  const m = t.match(/^User said at\s+([^:]+):\s*([\s\S]*)$/);
  if (!m) return null;
  const iso = (m[1] || '').trim();
  const body = (m[2] || '').trim();
  const ms = Date.parse(iso);
  return {
    createdAt: Number.isFinite(ms) ? ms : null,
    text: body
  };
}

export function formatMemoryTimestamp(ts) {
  const ms = typeof ts === 'string' ? Date.parse(ts) : Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d);
}

export function getMemoryDisplayParts(m) {
  const legacy = parseLegacyMemoryText(m?.text);
  const text = (legacy?.text ?? m?.text ?? '').toString().trim();
  const createdAt = legacy?.createdAt ?? m?.createdAt ?? null;
  return {
    text,
    createdAt,
    meta: createdAt ? formatMemoryTimestamp(createdAt) : ''
  };
}

function normalizeTextForMemory(s) {
  const t = (s || '').toString().trim();
  if (!t) return '';
  return t.length > 600 ? t.slice(0, 600) : t;
}

export function formatUserPromptMemory({ prompt, now }) {
  const clipped = normalizeTextForMemory(prompt);
  return clipped;
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
  if (!budget) return { block: '', usedChars: 0, count: 0, memories: [] };

  // Budget applies to the entire block.
  let used = 0;
  let count = 0;
  let body = '';
  const selected = [];

  const items = (memories || []).filter((m) => m && m.text);
  for (const m of items) {
    const parts = getMemoryDisplayParts(m);
    const meta = parts.meta ? `[${parts.meta}] ` : '';
    const line = `- ${meta}${parts.text}`;
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
    selected.push(m);
  }

  if (!count) return { block: '', usedChars: 0, count, memories: [] };
  return { block: `${header}${body}`, usedChars: used, count, memories: selected };
}

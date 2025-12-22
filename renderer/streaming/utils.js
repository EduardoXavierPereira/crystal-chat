/**
 * Streaming utilities - shared functions for streaming and memory editor
 */

/**
 * Show temporary status message in UI status bar
 * @param {HTMLElement} statusEl - The status element to update
 * @param {string} suffix - Text to append to current status
 * @param {object} options - Configuration
 * @param {number} options.ms - Duration in milliseconds before reverting (default: 2000)
 */
export function setStatusTemp(statusEl, suffix, { ms = 2000 } = {}) {
  try {
    if (!statusEl) return;
    const prev = (statusEl.textContent || '').toString();
    statusEl.textContent = suffix ? (prev ? `${prev} • ${suffix}` : suffix) : prev;
    window.setTimeout(() => {
      try {
        if (statusEl) statusEl.textContent = prev;
      } catch {
        // ignore
      }
    }, Number.isFinite(ms) ? ms : 2000);
  } catch {
    // ignore
  }
}

/**
 * Extract first complete JSON object from text
 * Handles cases where model output contains text before/after JSON
 * @param {string} text - Text possibly containing JSON
 * @returns {object|null} Parsed JSON object or null
 */
export function extractFirstJsonObject(text) {
  const raw = (text || '').toString().trim();
  if (!raw) return null;

  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) return null;
  const candidate = raw.slice(start, end + 1).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Normalize memory editor actions from flexible JSON schemas
 * Supports multiple action formats: {"actions":[...]}, {"create":[...]}, etc.
 * @param {object} obj - Parsed JSON from model
 * @returns {array} Normalized action objects
 */
export function normalizeMemoryEditorActions(obj) {
  const out = [];

  const push = (a) => {
    if (!a || typeof a !== 'object') return;
    const type = (a.type || a.action || '').toString().trim().toLowerCase();
    if (type !== 'create' && type !== 'update' && type !== 'delete') return;

    const id = typeof a.id === 'string' ? a.id : null;
    const text = typeof a.text === 'string' ? a.text : null;
    const match =
      typeof a.match === 'string'
        ? a.match
        : typeof a.memory === 'string'
          ? a.memory
          : typeof a.target === 'string'
            ? a.target
            : null;

    if (type === 'create') {
      out.push({ type, id, text, match: null });
      return;
    }

    // For update/delete allow the model to reference memories by human-readable text.
    const matchText = match || (type === 'delete' ? text : null);
    out.push({ type, id, text: type === 'update' ? text : null, match: matchText });
  };

  if (!obj || typeof obj !== 'object') return out;

  if (Array.isArray(obj.actions)) {
    obj.actions.forEach(push);
    return out;
  }

  if (Array.isArray(obj.create)) {
    obj.create.forEach((x) => push({ type: 'create', text: x?.text ?? x }));
  }
  if (Array.isArray(obj.update)) {
    obj.update.forEach((x) =>
      push({
        type: 'update',
        id: x?.id,
        text: x?.text,
        match: x?.match ?? x?.memory ?? x?.target ?? x?.existing
      })
    );
  }
  if (Array.isArray(obj.delete)) {
    obj.delete.forEach((x) =>
      push({
        type: 'delete',
        id: x?.id ?? x,
        match: x?.match ?? x?.memory ?? x?.target ?? (typeof x === 'string' ? x : null)
      })
    );
  }

  return out;
}

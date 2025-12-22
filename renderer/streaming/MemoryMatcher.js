/**
 * Memory matching utilities - fuzzy text matching for memory CRUD operations
 * Allows model to reference existing memories by human-readable text
 */

/**
 * Normalize text for memory matching
 * Lowercase, trim whitespace, collapse internal whitespace
 * @param {string} s - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeForMemoryMatch(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find memory ID by fuzzy text match
 * Uses token overlap and substring similarity scoring
 * Model can reference memory by paraphrasing, with some tolerance for wording
 * @param {string} text - Text from model to match (e.g., "User likes coffee")
 * @param {array} retrieved - Array of memory objects with {id, text} properties
 * @returns {string|null} Memory ID if found, null otherwise
 */
export function findMemoryIdByText(text, retrieved) {
  const targetNorm = normalizeForMemoryMatch(text);
  if (!targetNorm) return null;

  const tokens = targetNorm.split(' ').filter(Boolean);
  const tokenCount = tokens.length || 1;

  let bestId = null;
  let bestScore = 0;

  for (const m of Array.isArray(retrieved) ? retrieved : []) {
    if (!m?.id) continue;

    const memNorm = normalizeForMemoryMatch(m.text);
    if (!memNorm) continue;

    // Exact match wins immediately
    if (memNorm === targetNorm) return m.id;

    // Flexible similarity: token overlap ratio + substring length ratio
    const memTokens = memNorm.split(' ').filter(Boolean);
    const setMem = new Set(memTokens);
    const overlap = tokens.filter((t) => setMem.has(t)).length;
    const overlapScore = overlap / tokenCount;

    const substringScore =
      memNorm.includes(targetNorm) || targetNorm.includes(memNorm)
        ? Math.min(targetNorm.length, memNorm.length) / Math.max(targetNorm.length, memNorm.length)
        : 0;

    const score = Math.max(overlapScore, substringScore);
    if (score > bestScore && score >= 0.45) {
      bestScore = score;
      bestId = m.id;
    }
  }

  return bestId;
}

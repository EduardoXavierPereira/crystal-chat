/**
 * Setup logging utilities
 */

export function appendSetupLogLine(els, line) {
  if (els.setupMessageEl) {
    const current = (els.setupMessageEl.textContent || '').toString();
    els.setupMessageEl.textContent = current ? current + '\n' + line : line;
  }
}

export function isNoisyCliProgressLine(line) {
  const s = (line || '').toString().trim();
  if (!s) return true;
  // Common curl --progress-bar artifacts (prints lots of # and token fragments)
  if (/^#(=|#|O|-|\s)*$/.test(s)) return true;
  if (/^##O[=#-]?\s*$/.test(s)) return true;
  // Fractional percent updates are handled by the % parser; don't spam the log.
  if (/^\d+(\.\d+)?%$/.test(s)) return true;
  return false;
}

/**
 * Release notes parsing utility
 */

export function releaseNotesToPlainText(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    const parts = releaseNotes
      .map((n) => {
        if (typeof n === 'string') return n;
        if (n && typeof n === 'object') return n.note || n.notes || n.body || '';
        return '';
      })
      .filter((s) => typeof s === 'string' && s.trim());
    return releaseNotesToPlainText(parts.join('\n\n'));
  }

  if (typeof releaseNotes !== 'string') return '';
  const raw = releaseNotes.trim();
  if (!raw) return '';

  // electron-updater may provide HTML release notes; convert to readable text.
  if (raw.includes('<') && raw.includes('>')) {
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      const text = (doc?.body?.textContent || '').replace(/\r\n/g, '\n');
      return text.replace(/\n{3,}/g, '\n\n').trim();
    } catch {
      // fall through to raw
    }
  }

  return raw;
}

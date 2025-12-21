const fs = require('fs');
const path = require('path');
const { httpGetText, stripHtmlToText } = require('../utils/http-client');

/**
 * Web fetch and local file reading utilities.
 * Provides content fetching accessible via IPC.
 */

/**
 * Open and fetch a URL's content
 * @param {string} url - URL to fetch
 * @returns {Promise<object>} Result object with content
 */
async function openLink(url) {
  const raw = (url || '').toString().trim();
  if (!raw) return { ok: false, error: 'missing_url' };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' };
  }

  const res = await httpGetText(u.toString(), { timeoutMs: 10000, maxBytes: 700 * 1024 });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return { ok: false, error: `http_${res.statusCode}` };
  }

  const contentType = (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '';
  const ct = Array.isArray(contentType) ? contentType.join(';') : String(contentType);
  const body = res.body || '';
  const isHtml = /text\/html/i.test(ct) || /<html/i.test(body);
  const text = isHtml ? stripHtmlToText(body) : body.toString().trim();

  return {
    ok: true,
    url: u.toString(),
    contentType: ct,
    truncated: !!res.truncated,
    bytes: typeof res.bytes === 'number' ? res.bytes : undefined,
    maxBytes: typeof res.maxBytes === 'number' ? res.maxBytes : undefined,
    text: text.slice(0, 12000)
  };
}

/**
 * Read a local file
 * @param {string} filePath - Path to file
 * @returns {Promise<object>} Result object with content
 */
async function readLocalFile(filePath) {
  const raw = (filePath || '').toString().trim();
  if (!raw) return { ok: false, error: 'missing_path' };

  let p = raw;
  try {
    if (raw.startsWith('file://')) {
      const u = new URL(raw);
      if (u.protocol !== 'file:') return { ok: false, error: 'unsupported_protocol' };
      p = decodeURIComponent(u.pathname || '');
    }
  } catch {
    // ignore
  }

  p = p.replace(/\r?\n/g, '').trim();
  if (!p) return { ok: false, error: 'invalid_path' };

  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return { ok: false, error: 'not_found' };
  }
  if (!st.isFile()) return { ok: false, error: 'not_a_file' };

  const name = path.basename(p);
  const size = typeof st.size === 'number' ? st.size : 0;
  const ext = (path.extname(name) || '').toLowerCase();

  const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
  const isText = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.py', '.html', '.css', '.yaml', '.yml'].includes(ext);

  const capTextChars = 200000;
  const capBinaryBytes = 10 * 1024 * 1024;

  if (isImage) {
    if (size > capBinaryBytes) return { ok: false, error: 'too_large' };
    let buf;
    try {
      buf = fs.readFileSync(p);
    } catch {
      return { ok: false, error: 'read_failed' };
    }
    const base64 = buf.toString('base64');
    const mimeByExt = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    const type = mimeByExt[ext] || 'image/*';
    return { ok: true, kind: 'image', name, size, type, base64 };
  }

  if (isText || !ext) {
    let txt;
    try {
      txt = fs.readFileSync(p, 'utf8');
    } catch {
      return { ok: false, error: 'read_failed' };
    }
    const clipped = txt.length > capTextChars ? `${txt.slice(0, capTextChars)}\n\n[...truncated...]` : txt;
    return { ok: true, kind: 'text', name, size, type: 'text/plain', text: clipped };
  }

  return { ok: false, error: 'unsupported_file_type' };
}

module.exports = {
  openLink,
  readLocalFile
};

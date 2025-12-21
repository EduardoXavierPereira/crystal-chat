const { httpGetText } = require('../utils/http-client');

/**
 * Web search utilities using DuckDuckGo.
 * Provides search functionality accessible via IPC.
 */

/**
 * Decode HTML entities
 * @param {string} s - String to decode
 * @returns {string}
 */
function decodeHtml(s) {
  const t = (s || '').toString();
  return t
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Strip HTML tags from string
 * @param {string} s - String to strip
 * @returns {string}
 */
function stripTags(s) {
  return decodeHtml((s || '').toString().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Normalize DuckDuckGo result URL
 * @param {string} href - Raw URL from search result
 * @returns {string}
 */
function normalizeResultUrl(href) {
  const raw = (href || '').toString().trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) {
      try {
        return decodeURIComponent(uddg);
      } catch {
        return uddg;
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Try parsing DuckDuckGo Lite results
 * @param {string} query - Search query
 * @param {Array} results - Results array to populate
 * @param {object} debug - Debug object to populate
 * @returns {Promise<void>}
 */
async function tryParseLite(query, results, debug) {
  const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const liteRes = await httpGetText(liteUrl, {
    timeoutMs: 9000,
    maxBytes: 900 * 1024,
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  debug.lite = {
    url: liteUrl,
    statusCode: liteRes.statusCode || 0,
    contentType: (liteRes.headers && (liteRes.headers['content-type'] || liteRes.headers['Content-Type'])) || '',
    sample: (liteRes.body || '').toString().slice(0, 500)
  };
  if (liteRes.statusCode < 200 || liteRes.statusCode >= 300) return;
  const html = (liteRes.body || '').toString();

  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    const attrs = (m[1] || '').toString();
    if (!/\bresult-link\b/i.test(attrs)) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) continue;
    const url = normalizeResultUrl(hrefMatch[2]);
    const title = stripTags(m[2]).slice(0, 200);
    if (!url) continue;
    results.push({ title, snippet: '', url });
  }
}

/**
 * Try parsing DuckDuckGo HTML results
 * @param {string} query - Search query
 * @param {Array} results - Results array to populate
 * @param {object} debug - Debug object to populate
 * @returns {Promise<void>}
 */
async function tryParseHtml(query, results, debug) {
  const htmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const htmlRes = await httpGetText(htmlUrl, {
    timeoutMs: 9000,
    maxBytes: 900 * 1024,
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  debug.html = {
    url: htmlUrl,
    statusCode: htmlRes.statusCode || 0,
    contentType: (htmlRes.headers && (htmlRes.headers['content-type'] || htmlRes.headers['Content-Type'])) || '',
    sample: (htmlRes.body || '').toString().slice(0, 500)
  };

  if (htmlRes.statusCode >= 200 && htmlRes.statusCode < 300) {
    const html = (htmlRes.body || '').toString();
    const blocks = html.split(/<div[^>]+class="result__body"[^>]*>/i);
    for (const b of blocks) {
      if (results.length >= 8) break;
      const a = b.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!a) continue;
      const url = normalizeResultUrl(a[1]);
      const title = stripTags(a[2]).slice(0, 200);
      const sn = b.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = sn ? stripTags(sn[1]) : '';
      if (!url) continue;
      results.push({ title, snippet, url });
    }
  }
}

/**
 * Try parsing DuckDuckGo API results as fallback
 * @param {string} query - Search query
 * @param {Array} results - Results array to populate
 * @param {object} debug - Debug object to populate
 * @returns {Promise<string>} Abstract text from API
 */
async function tryParseApi(query, results, debug) {
  const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await httpGetText(apiUrl, { timeoutMs: 8000, maxBytes: 512 * 1024 });
  debug.api = {
    url: apiUrl,
    statusCode: res.statusCode || 0,
    contentType: (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '',
    sample: (res.body || '').toString().slice(0, 500)
  };
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return '';
  }
  let json;
  try {
    json = JSON.parse(res.body || '{}');
  } catch {
    return '';
  }

  const pushTopic = (t) => {
    if (!t) return;
    const text = t.Text ? String(t.Text) : '';
    const firstUrl = t.FirstURL ? String(t.FirstURL) : '';
    if (!text && !firstUrl) return;
    results.push({ title: text.slice(0, 120), snippet: text, url: firstUrl });
  };

  if (Array.isArray(json?.RelatedTopics)) {
    for (const t of json.RelatedTopics) {
      if (t && Array.isArray(t.Topics)) {
        for (const inner of t.Topics) pushTopic(inner);
      } else {
        pushTopic(t);
      }
      if (results.length >= 8) break;
    }
  }

  return json?.AbstractText ? String(json.AbstractText) : '';
}

/**
 * Perform a web search using DuckDuckGo
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
async function webSearch(query) {
  const q = (query || '').toString().trim();
  if (!q) return { ok: false, error: 'missing_query' };

  const results = [];
  const debug = {
    lite: null,
    html: null,
    api: null
  };

  try {
    await tryParseLite(q, results, debug);
  } catch {
    // ignore
  }

  if (results.length === 0) {
    try {
      await tryParseHtml(q, results, debug);
    } catch {
      // ignore
    }
  }

  if (results.length > 0) {
    return { ok: true, query: q, abstract: '', results, debug };
  }

  // Fallback to API
  let abstract = '';
  try {
    abstract = await tryParseApi(q, results, debug);
  } catch {
    // ignore
  }

  if (results.length === 0) {
    return { ok: false, error: 'no_results', debug };
  }

  return {
    ok: true,
    query: q,
    abstract,
    results,
    debug
  };
}

module.exports = {
  webSearch
};

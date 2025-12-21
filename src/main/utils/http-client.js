const http = require('http');
const https = require('https');

/**
 * HTTP utilities for making requests.
 * Extracted from main.js to improve modularity.
 */

/**
 * Make a GET request and parse JSON response
 * @param {string} url - The URL to fetch
 * @param {object} options - Options including timeoutMs
 * @returns {Promise<object>} Parsed JSON response
 */
function httpJson(url, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode || 0}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

/**
 * Make a POST request with JSON body
 * @param {string} url - The URL to post to
 * @param {object} body - The JSON body to send
 * @param {object} options - Options including timeoutMs
 * @returns {Promise<object>} Parsed JSON response
 */
function httpPostJson(url, body, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const u = new URL(url);
    const req = http.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw || '{}'));
            } catch (e) {
              reject(e);
            }
          } else {
            const err = new Error(`HTTP ${res.statusCode || 0}`);
            err.body = raw;
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * Make a GET request and return text response with redirect support
 * @param {string} url - The URL to fetch
 * @param {object} options - Options including timeoutMs, maxBytes, headers, maxRedirects
 * @returns {Promise<object>} Response object with statusCode, headers, body, truncated, bytes, maxBytes
 */
async function httpGetText(url, { timeoutMs = 8000, maxBytes = 512 * 1024, headers = {}, maxRedirects = 3 } = {}) {
  const fetchOnce = (u) => {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };
      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port: u.port,
          path: `${u.pathname}${u.search}`,
          headers: {
            'User-Agent': 'CrystalChat/0.2',
            ...headers
          }
        },
        (res) => {
          const chunks = [];
          let total = 0;
          let truncated = false;
          res.on('data', (buf) => {
            if (!buf) return;
            if (total >= maxBytes) {
              truncated = true;
              return;
            }

            const remaining = maxBytes - total;
            if (buf.length > remaining) {
              chunks.push(buf.slice(0, remaining));
              total += remaining;
              truncated = true;
              const body = Buffer.concat(chunks).toString('utf8');
              settleResolve({
                statusCode: res.statusCode || 0,
                headers: res.headers || {},
                body,
                truncated: true,
                bytes: total,
                maxBytes
              });
              req.destroy();
              return;
            }

            chunks.push(buf);
            total += buf.length;
          });
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            settleResolve({
              statusCode: res.statusCode || 0,
              headers: res.headers || {},
              body,
              truncated,
              bytes: total,
              maxBytes
            });
          });
        }
      );
      req.on('error', settleReject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('timeout'));
      });
      req.end();
    });
  };

  let current = new URL(url);
  let redirects = 0;
  while (true) {
    const res = await fetchOnce(current);
    const sc = res.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(sc) && redirects < maxRedirects) {
      const loc = (res.headers && (res.headers.location || res.headers.Location)) || '';
      const location = Array.isArray(loc) ? loc[0] : String(loc || '');
      if (!location) return res;
      current = new URL(location, current);
      redirects += 1;
      continue;
    }
    return res;
  }
}

/**
 * Strip HTML tags and convert to plain text
 * @param {string} html - HTML string to strip
 * @returns {string} Plain text
 */
function stripHtmlToText(html) {
  const raw = (html || '').toString();
  // Remove script/style
  let s = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Drop tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode a few common entities
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = {
  httpJson,
  httpPostJson,
  httpGetText,
  stripHtmlToText
};

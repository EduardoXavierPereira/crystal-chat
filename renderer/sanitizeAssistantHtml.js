export function sanitizeAssistantHtml(html) {
  const raw = (html || '').toString();
  if (!raw) return '';

  const allowedTags = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'li',
    'ol',
    'p',
    'pre',
    'span',
    'strong',
    'ul'
  ]);

  const allowedAttrsByTag = {
    a: new Set(['href', 'title', 'target', 'rel']),
    code: new Set(['class']),
    pre: new Set(['class']),
    span: new Set(['class']),
    div: new Set(['class'])
  };

  const safeUrl = (url) => {
    const s = (url || '').toString().trim();
    if (!s) return '';
    if (s.startsWith('#')) return s;
    let parsed;
    try {
      parsed = new URL(s, 'https://example.invalid');
    } catch {
      return '';
    }
    const proto = (parsed.protocol || '').toLowerCase();
    if (proto === 'http:' || proto === 'https:' || proto === 'mailto:') return s;
    return '';
  };

  const doc = new DOMParser().parseFromString(raw, 'text/html');

  const sanitizeNode = (node) => {
    if (!node) return;
    const kids = Array.from(node.childNodes || []);
    for (const child of kids) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child.tagName || '').toLowerCase();
        if (!allowedTags.has(tag)) {
          child.replaceWith(document.createTextNode(child.textContent || ''));
          continue;
        }

        const allowedAttrs = allowedAttrsByTag[tag] || new Set();
        for (const attr of Array.from(child.attributes || [])) {
          const name = (attr.name || '').toLowerCase();
          if (name.startsWith('on')) {
            child.removeAttribute(attr.name);
            continue;
          }
          if (!allowedAttrs.has(name)) {
            child.removeAttribute(attr.name);
            continue;
          }
        }

        if (tag === 'a') {
          const href = safeUrl(child.getAttribute('href'));
          if (!href) {
            child.removeAttribute('href');
          } else {
            child.setAttribute('href', href);
            child.setAttribute('rel', 'noopener noreferrer');
            child.setAttribute('target', '_blank');
          }
        }

        sanitizeNode(child);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  };

  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}

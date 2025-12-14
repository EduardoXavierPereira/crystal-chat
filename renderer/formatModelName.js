export function formatModelName(model) {
  const raw = (model || '').toString().trim();
  if (!raw) return '';

  const [baseRaw, tagRaw] = raw.split(':');
  const base = (baseRaw || '').trim();
  const tag = (tagRaw || '').trim();

  let vendor = base;
  let version = '';

  const m = base.match(/^([a-zA-Z]+)(\d+)?$/);
  if (m) {
    vendor = m[1] || base;
    version = m[2] || '';
  }

  const vendorPretty = vendor ? vendor.charAt(0).toUpperCase() + vendor.slice(1).toLowerCase() : base;
  const basePretty = version ? `${vendorPretty} ${version}` : vendorPretty;

  if (!tag || tag.toLowerCase() === 'latest') return basePretty;

  // Common tags like 0.6b / 8b
  const tagPretty = tag.replace(/b$/i, 'B');
  return `${basePretty} (${tagPretty})`;
}

export function renderMemories({ els, memories, query, onDelete } = {}) {
  if (!els?.memoriesListEl) return;
  els.memoriesListEl.innerHTML = '';

  const q = (query || '').toString().trim().toLowerCase();
  const items = Array.isArray(memories) ? memories : [];
  const filtered = !q
    ? items
    : items.filter((m) => ((m?.text || '').toString().toLowerCase().includes(q)));

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'memories-empty';
    empty.textContent = items.length === 0 ? 'No memories yet.' : 'No matches.';
    els.memoriesListEl.appendChild(empty);
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
    .forEach((m) => {
      const row = document.createElement('div');
      row.className = 'memories-item';

      const text = document.createElement('div');
      text.className = 'memories-text';
      text.textContent = (m?.text || '').toString();
      row.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'memories-item-actions';

      const del = document.createElement('button');
      del.className = 'memories-delete danger';
      del.type = 'button';
      del.textContent = 'Delete';
      del.onclick = async () => onDelete?.(m?.id);
      actions.appendChild(del);

      row.appendChild(actions);
      els.memoriesListEl.appendChild(row);
    });
}

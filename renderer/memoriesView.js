export function renderMemories({ els, memories, query, onDelete, onEdit } = {}) {
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

      const content = document.createElement('div');
      content.className = 'memories-content';
      row.appendChild(content);

      // Lazy import to avoid coupling this tiny view module too tightly.
      // (Also keeps initial renderer boot faster.)
      // eslint-disable-next-line no-void
      void import('./memories.js').then(({ getMemoryDisplayParts }) => {
        const parts = getMemoryDisplayParts?.(m) || { text: (m?.text || '').toString(), meta: '' };

        if (parts.meta) {
          const meta = document.createElement('div');
          meta.className = 'memories-meta';
          meta.textContent = parts.meta;
          content.appendChild(meta);
        }

        const text = document.createElement('div');
        text.className = 'memories-text';
        text.textContent = (parts.text || '').toString();
        content.appendChild(text);
      });

      const actions = document.createElement('div');
      actions.className = 'memories-item-actions';

      const edit = document.createElement('button');
      edit.className = 'memories-edit';
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.onclick = async () => onEdit?.(m);
      actions.appendChild(edit);

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

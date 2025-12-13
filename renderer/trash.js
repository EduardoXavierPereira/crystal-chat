import { chatTitleFromMessages } from './sidebar.js';

export function renderTrash({ els, trashedChats, trashQuery, onRestore, onDelete }) {
  if (!els.trashListEl) return;
  els.trashListEl.innerHTML = '';

  const filtered = !trashQuery
    ? trashedChats
    : trashedChats.filter((c) => {
        const title = (chatTitleFromMessages(c) || '').toLowerCase();
        const msgText = (c.messages || [])
          .slice(0, 10)
          .map((m) => m.content || '')
          .join(' ')
          .toLowerCase();
        return title.includes(trashQuery) || msgText.includes(trashQuery);
      });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'trash-empty';
    empty.textContent = trashedChats.length === 0 ? 'Trash is empty.' : 'No matches.';
    els.trashListEl.appendChild(empty);
    return;
  }

  filtered.forEach((chat) => {
    const row = document.createElement('div');
    row.className = 'trash-item';

    const name = document.createElement('div');
    name.className = 'trash-name';
    name.textContent = chatTitleFromMessages(chat);
    row.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'trash-item-actions';

    const restore = document.createElement('button');
    restore.className = 'trash-restore';
    restore.textContent = 'Restore';
    restore.onclick = async () => onRestore(chat.id);
    actions.appendChild(restore);

    const del = document.createElement('button');
    del.className = 'trash-delete danger';
    del.textContent = 'Delete';
    del.onclick = async () => onDelete(chat.id);
    actions.appendChild(del);

    row.appendChild(actions);
    els.trashListEl.appendChild(row);
  });
}

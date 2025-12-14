import { chatTitleFromMessages } from './sidebar.js';

export function renderPinnedDropdown({ els, pinnedChats, onOpenChat }) {
  if (!els.pinnedDropdownListEl) return;
  els.pinnedDropdownListEl.innerHTML = '';

  if (!pinnedChats || pinnedChats.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pinned-dropdown-empty';
    empty.textContent = 'No pinned chats yet.';
    els.pinnedDropdownListEl.appendChild(empty);
    return;
  }

  pinnedChats.forEach((chat) => {
    const row = document.createElement('div');
    row.className = 'pinned-dropdown-item';
    row.onclick = () => onOpenChat(chat.id);

    const name = document.createElement('div');
    name.className = 'pinned-dropdown-name';
    name.textContent = chatTitleFromMessages(chat);
    row.appendChild(name);

    els.pinnedDropdownListEl.appendChild(row);
  });
}

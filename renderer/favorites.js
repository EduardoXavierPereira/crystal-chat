import { chatTitleFromMessages } from './sidebar.js';

export function renderFavorites({ els, favoriteChats, onOpenChat }) {
  if (!els.favoritesListEl) return;
  els.favoritesListEl.innerHTML = '';

  if (!favoriteChats || favoriteChats.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'favorites-empty';
    empty.textContent = 'No favorite chats yet.';
    els.favoritesListEl.appendChild(empty);
    return;
  }

  favoriteChats.forEach((chat) => {
    const row = document.createElement('div');
    row.className = 'favorites-item';
    row.onclick = () => onOpenChat(chat.id);

    const name = document.createElement('div');
    name.className = 'favorites-name';
    name.textContent = chatTitleFromMessages(chat);
    row.appendChild(name);

    els.favoritesListEl.appendChild(row);
  });
}

export function getEls() {
  return {
    chatListEl: document.getElementById('chat-list'),
    chatSearchInput: document.getElementById('chat-search-input'),
    messagesEl: document.getElementById('messages'),
    promptForm: document.getElementById('prompt-form'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    typingIndicator: document.getElementById('typing-indicator'),
    errorEl: document.getElementById('error'),
    newChatBtn: document.getElementById('new-chat'),
    pinnedBtn: document.getElementById('pinned-btn'),
    pinnedDropdownEl: document.getElementById('pinned-dropdown'),
    pinnedDropdownListEl: document.getElementById('pinned-dropdown-list'),
    statusEl: document.getElementById('status'),
    trashBtn: document.getElementById('trash-btn'),
    trashViewEl: document.getElementById('trash-view'),
    trashListEl: document.getElementById('trash-list'),
    trashSearchInput: document.getElementById('trash-search-input'),
    trashRestoreAllBtn: document.getElementById('trash-restore-all'),
    trashDeleteAllBtn: document.getElementById('trash-delete-all'),
    confirmModalEl: document.getElementById('confirm-modal'),
    confirmMessageEl: document.getElementById('confirm-message'),
    confirmCancelBtn: document.getElementById('confirm-cancel'),
    confirmOkBtn: document.getElementById('confirm-ok')
  };
}

export function chatTitleFromMessages(chat) {
  if (chat.title && chat.title.trim() && chat.title.trim() !== 'New chat') {
    return chat.title.trim();
  }
  if (chat.messages.length === 0) return 'New chat';
  const firstUser = chat.messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 32) + (trimmed.length > 32 ? '…' : '');
}

function escapeHtml(text) {
  return (text || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function escapeRegExp(text) {
  return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderChats({ els, state, onSetActiveChat, onStartRename, onTrashChat, onTogglePinned }) {
  els.chatListEl.innerHTML = '';
  els.trashBtn?.classList.toggle('active', state.sidebarSelection.kind === 'trash');
  els.pinnedBtn?.classList.toggle('active', !!state.pinnedOpen);
  els.pinnedBtn?.classList.toggle('open', !!state.pinnedOpen);

  const query = (state.chatQuery || '').trim().toLowerCase();
  const chats = query
    ? state.chats.filter((chat) => chatTitleFromMessages(chat).toLowerCase().includes(query))
    : state.chats;

  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${state.sidebarSelection.kind === 'chat' && chat.id === state.sidebarSelection.id ? 'active' : ''}`;
    item.onclick = () => onSetActiveChat(chat.id);

    const content = document.createElement('div');
    content.className = 'chat-name';
    const isEditing = state.renamingId === chat.id;

    if (isEditing) {
      const input = document.createElement('input');
      input.className = 'chat-rename-input';
      input.value = chatTitleFromMessages(chat);
      input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await onStartRename.commit(chat.id, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          await onStartRename.cancel();
        }
      };
      input.onblur = async () => {
        await onStartRename.commit(chat.id, input.value);
      };
      content.appendChild(input);
      requestAnimationFrame(() => input.focus());
    } else {
      const name = document.createElement('div');
      const title = chatTitleFromMessages(chat);
      if (query) {
        const safeTitle = escapeHtml(title);
        const safeQuery = escapeRegExp(query);
        const re = new RegExp(safeQuery, 'ig');
        name.innerHTML = safeTitle.replace(re, (m) => `<mark class="chat-search-hit">${escapeHtml(m)}</mark>`);
      } else {
        name.textContent = title;
      }
      content.appendChild(name);
    }

    item.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    const menuWrap = document.createElement('div');
    menuWrap.className = 'chat-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'chat-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Chat actions');
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.textContent = '⋯';

    const menu = document.createElement('div');
    menu.className = 'chat-menu hidden';
    menu.setAttribute('role', 'menu');

    const isPinned = !!chat.pinnedAt;
    const favoriteItem = document.createElement('button');
    favoriteItem.type = 'button';
    favoriteItem.className = 'chat-menu-item';
    favoriteItem.setAttribute('role', 'menuitem');
    favoriteItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M12 17.27l-5.18 2.73 1-5.85L3.64 9.24l5.9-.86L12 3l2.46 5.38 5.9.86-4.18 4.91 1 5.85L12 17.27Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + `<span class="chat-menu-item-text">${isPinned ? 'Unpin chat' : 'Pin chat'}</span>`;

    const renameItem = document.createElement('button');
    renameItem.type = 'button';
    renameItem.className = 'chat-menu-item';
    renameItem.setAttribute('role', 'menuitem');
    renameItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Rename</span>';

    const deleteItem = document.createElement('button');
    deleteItem.type = 'button';
    deleteItem.className = 'chat-menu-item danger';
    deleteItem.setAttribute('role', 'menuitem');
    deleteItem.innerHTML =
      '<span class="chat-menu-item-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="chat-menu-item-text">Delete</span>';

    menu.appendChild(favoriteItem);
    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);

    let cleanupMenuEvents = null;

    const closeMenu = () => {
      menu.classList.add('hidden');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }
    };

    const openMenu = () => {
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }

      menu.classList.remove('hidden');
      menuBtn.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');

      const onDocClick = (ev) => {
        if (!menuWrap.contains(ev.target)) closeMenu();
      };

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeMenu();
        }
      };

      window.addEventListener('click', onDocClick, true);
      window.addEventListener('keydown', onKeyDown, true);

      cleanupMenuEvents = () => {
        window.removeEventListener('click', onDocClick, true);
        window.removeEventListener('keydown', onKeyDown, true);
      };
    };

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      if (!menu.classList.contains('hidden')) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    menu.onclick = (e) => {
      e.stopPropagation();
    };

    favoriteItem.onclick = async (e) => {
      e.stopPropagation();
      closeMenu();
      await onTogglePinned?.(chat.id);
    };

    renameItem.onclick = (e) => {
      e.stopPropagation();
      closeMenu();
      onStartRename.begin(chat.id);
    };

    deleteItem.onclick = async (e) => {
      e.stopPropagation();
      closeMenu();
      await onTrashChat(chat.id);
    };

    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menu);
    actions.appendChild(menuWrap);

    item.appendChild(actions);
    els.chatListEl.appendChild(item);
  });
}

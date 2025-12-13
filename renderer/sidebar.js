export function getEls() {
  return {
    chatListEl: document.getElementById('chat-list'),
    messagesEl: document.getElementById('messages'),
    promptForm: document.getElementById('prompt-form'),
    promptInput: document.getElementById('prompt-input'),
    typingIndicator: document.getElementById('typing-indicator'),
    errorEl: document.getElementById('error'),
    newChatBtn: document.getElementById('new-chat'),
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

export function renderChats({ els, state, onSetActiveChat, onStartRename, onTrashChat }) {
  els.chatListEl.innerHTML = '';
  els.trashBtn?.classList.toggle('active', state.sidebarSelection.kind === 'trash');

  state.chats.forEach((chat) => {
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
      name.textContent = chatTitleFromMessages(chat);
      content.appendChild(name);
    }

    item.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    const rename = document.createElement('button');
    rename.className = 'chat-rename';
    rename.setAttribute('aria-label', 'Rename chat');
    rename.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    rename.onclick = (e) => {
      e.stopPropagation();
      onStartRename.begin(chat.id);
    };
    actions.appendChild(rename);

    const del = document.createElement('button');
    del.className = 'chat-delete danger';
    del.setAttribute('aria-label', 'Delete chat');
    del.textContent = '✕';
    del.onclick = async (e) => {
      e.stopPropagation();
      await onTrashChat(chat.id);
    };
    actions.appendChild(del);

    item.appendChild(actions);
    els.chatListEl.appendChild(item);
  });
}

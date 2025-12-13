const API_URL = 'http://localhost:11434/api/chat';
const MODEL = 'qwen3:4b';

const chatListEl = document.getElementById('chat-list');
const messagesEl = document.getElementById('messages');
const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const typingIndicator = document.getElementById('typing-indicator');
const errorEl = document.getElementById('error');
const newChatBtn = document.getElementById('new-chat');
const statusEl = document.getElementById('status');

const trashBtn = document.getElementById('trash-btn');
const trashViewEl = document.getElementById('trash-view');
const trashListEl = document.getElementById('trash-list');
const trashSearchInput = document.getElementById('trash-search-input');
const trashRestoreAllBtn = document.getElementById('trash-restore-all');
const trashDeleteAllBtn = document.getElementById('trash-delete-all');

const confirmModalEl = document.getElementById('confirm-modal');
const confirmMessageEl = document.getElementById('confirm-message');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmOkBtn = document.getElementById('confirm-ok');

let db;
let chats = [];
let isStreaming = false;
let pendingNew = false;
let renamingId = null;
let trashQuery = '';

let confirmAction = null;

const TEMP_CHAT_ID = '__temp_chat__';
let temporaryChatEnabled = false;
let tempChat = null;

let sidebarSelection = { kind: 'chat', id: null };

const UI_STATE_KEY = 'crystal-chat:ui-state';

function saveUIState() {
  try {
    const toSave = {
      sidebarSelection:
        sidebarSelection.kind === 'chat' && sidebarSelection.id === TEMP_CHAT_ID
          ? { kind: 'chat', id: null }
          : sidebarSelection
    };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

function loadUIState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSidebarSelection(next) {
  sidebarSelection = next;
  if (next.kind === 'trash') {
    pendingNew = false;
    renamingId = null;
  }
  if (next.kind !== 'chat' || next.id !== TEMP_CHAT_ID) {
    temporaryChatEnabled = false;
    tempChat = null;
  }
  saveUIState();
  renderChats();
  renderActiveChat();
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function autosizePrompt() {
  if (!promptInput) return;
  const styles = window.getComputedStyle(promptInput);
  const maxHeight = parseFloat(styles.maxHeight) || Infinity;
  promptInput.style.height = 'auto';
  const next = Math.min(promptInput.scrollHeight, maxHeight);
  promptInput.style.height = `${next}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

init();

async function init() {
  if (statusEl) statusEl.textContent = `Model: ${MODEL} (Ollama)`;
  try {
    const style = document.createElement('style');
    document.head.appendChild(style);
    style.sheet.insertRule('*::-webkit-scrollbar{width:8px}', 0);
    style.remove();
    console.log('[scrollbar] ::-webkit-scrollbar supported');
  } catch (e) {
    console.warn('[scrollbar] ::-webkit-scrollbar NOT supported/ignored by this build', e);
  }
  await openDB();
  await purgeExpiredTrashedChats();
  setInterval(() => {
    purgeExpiredTrashedChats().catch(() => {
      // ignore
    });
  }, 6 * 60 * 60 * 1000);
  chats = await loadChats();
  const ui = loadUIState();
  const savedSel = ui?.sidebarSelection;
  if (savedSel && savedSel.kind === 'trash') {
    sidebarSelection = { kind: 'trash' };
  } else if (savedSel && savedSel.kind === 'chat') {
    if (savedSel.id === null) {
      sidebarSelection = { kind: 'chat', id: null };
    } else if (typeof savedSel.id === 'string' && chats.some((c) => c.id === savedSel.id)) {
      sidebarSelection = { kind: 'chat', id: savedSel.id };
    } else {
      sidebarSelection = { kind: 'chat', id: chats[0]?.id || null };
    }
  } else {
    sidebarSelection = { kind: 'chat', id: chats[0]?.id || null };
  }
  renderChats();
  renderActiveChat();
  attachEvents();
  autosizePrompt();
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) promptInput?.focus();
  });
}

function attachEvents() {
  promptForm.addEventListener('submit', handleSubmit);
  promptInput.addEventListener('input', autosizePrompt);
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  });
  newChatBtn.addEventListener('click', async () => {
    pendingNew = true;
    setSidebarSelection({ kind: 'chat', id: null });
    promptInput.value = '';
    autosizePrompt();
    promptInput.focus();
  });

  trashBtn?.addEventListener('click', () => {
    const nextKind = sidebarSelection.kind === 'trash' ? 'chat' : 'trash';
    if (nextKind === 'trash') {
      setSidebarSelection({ kind: 'trash' });
      if (trashSearchInput) trashSearchInput.focus();
    } else {
      setSidebarSelection({ kind: 'chat', id: chats[0]?.id || null });
      promptInput?.focus();
    }
  });

  trashSearchInput?.addEventListener('input', () => {
    trashQuery = (trashSearchInput.value || '').trim().toLowerCase();
    renderTrash();
  });

  trashRestoreAllBtn?.addEventListener('click', async () => {
    await restoreAllTrashedChats();
  });

  trashDeleteAllBtn?.addEventListener('click', async () => {
    await requestDeleteAllTrashed();
  });

  confirmCancelBtn?.addEventListener('click', () => {
    closeConfirm();
  });

  confirmOkBtn?.addEventListener('click', async () => {
    const action = confirmAction;
    closeConfirm();
    if (typeof action === 'function') {
      await action();
    }
  });

  confirmModalEl?.addEventListener('click', (e) => {
    if (e.target === confirmModalEl) closeConfirm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModalEl && !confirmModalEl.classList.contains('hidden')) {
      closeConfirm();
    }
  });
}

function openConfirm(message, onConfirm) {
  confirmAction = onConfirm;
  if (confirmMessageEl) confirmMessageEl.textContent = message;
  confirmModalEl?.classList.remove('hidden');
  confirmCancelBtn?.focus();
}

function closeConfirm() {
  confirmAction = null;
  confirmModalEl?.classList.add('hidden');
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('crystal-chat', 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function loadChats() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const store = tx.objectStore('chats');
    const req = store.getAll();
    req.onsuccess = () => {
      const sorted = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const active = sorted.filter((c) => !c.deletedAt);
      resolve(active);
    };
    req.onerror = () => reject(req.error);
  });
}

function saveChat(chat) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    const req = store.put(chat);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function loadTrashedChats() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readonly');
    const store = tx.objectStore('chats');
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result || [])
        .filter((c) => !!c.deletedAt)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteChat(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function purgeExpiredTrashedChats() {
  const now = Date.now();
  const trashed = await loadTrashedChats();
  const expired = trashed.filter((c) => (c.deletedAt || 0) + TRASH_RETENTION_MS <= now);
  if (expired.length === 0) return;
  await Promise.all(expired.map((c) => deleteChat(c.id)));
}

async function createChat(title) {
  const id = crypto.randomUUID();
  const chat = {
    id,
    title,
    createdAt: Date.now(),
    messages: []
  };
  await saveChat(chat);
  chats = [chat, ...chats];
  return id;
}

function setActiveChat(id) {
  setSidebarSelection({ kind: 'chat', id });
}

function renderChats() {
  chatListEl.innerHTML = '';
  trashBtn?.classList.toggle('active', sidebarSelection.kind === 'trash');
  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${sidebarSelection.kind === 'chat' && chat.id === sidebarSelection.id ? 'active' : ''}`;
    item.onclick = () => setActiveChat(chat.id);

    const content = document.createElement('div');
    content.className = 'chat-name';
    const isEditing = renamingId === chat.id;

    if (isEditing) {
      const input = document.createElement('input');
      input.className = 'chat-rename-input';
      input.value = chatTitleFromMessages(chat);
      input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await commitRename(chat.id, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          renamingId = null;
          renderChats();
        }
      };
      input.onblur = async () => {
        await commitRename(chat.id, input.value);
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
      renamingId = chat.id;
      renderChats();
    };
    actions.appendChild(rename);

    const del = document.createElement('button');
    del.className = 'chat-delete danger';
    del.setAttribute('aria-label', 'Delete chat');
    del.textContent = '✕';
    del.onclick = async (e) => {
      e.stopPropagation();
      await handleTrashChat(chat.id);
    };
    actions.appendChild(del);

    item.appendChild(actions);

    chatListEl.appendChild(item);
  });
}

function renderTrash() {
  if (!trashListEl) return;
  trashListEl.innerHTML = '';

  loadTrashedChats().then((trashed) => {
    const filtered = !trashQuery
      ? trashed
      : trashed.filter((c) => {
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
      empty.textContent = trashed.length === 0 ? 'Trash is empty.' : 'No matches.';
      trashListEl.appendChild(empty);
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
      restore.onclick = async () => {
        await restoreChat(chat.id);
      };
      actions.appendChild(restore);

      const del = document.createElement('button');
      del.className = 'trash-delete danger';
      del.textContent = 'Delete';
      del.onclick = async () => {
        await deleteChatPermanently(chat.id);
      };
      actions.appendChild(del);

      row.appendChild(actions);
      trashListEl.appendChild(row);
    });
  });
}

function chatTitleFromMessages(chat) {
  if (chat.title && chat.title.trim() && chat.title.trim() !== 'New chat') {
    return chat.title.trim();
  }
  if (chat.messages.length === 0) return 'New chat';
  const firstUser = chat.messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Conversation';
  const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 32) + (trimmed.length > 32 ? '…' : '');
}

function renderMessageElement(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;

  const header = document.createElement('div');
  header.className = 'message-header';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'message-header-icon';
  if (msg.role === 'user') {
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  } else {
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="7" width="14" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="M9 12h.01M15 12h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 19v2M16 19v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  const label = document.createElement('span');
  label.className = 'message-header-label';
  label.textContent = msg.role === 'user' ? 'User' : 'Assistant';

  header.appendChild(iconWrap);
  header.appendChild(label);

  const content = document.createElement('div');
  content.className = 'message-content';

  if (msg.role === 'assistant' && window.marked) {
    content.innerHTML = window.marked.parse(msg.content || '');
  } else {
    content.textContent = msg.content;
  }

  div.appendChild(header);
  div.appendChild(content);
  return div;
}

function renderActiveChat() {
  const activeChatId = sidebarSelection.kind === 'chat' ? sidebarSelection.id : null;
  const chat = activeChatId === TEMP_CHAT_ID ? tempChat : chats.find((c) => c.id === activeChatId);

  if (trashViewEl) trashViewEl.classList.toggle('hidden', sidebarSelection.kind !== 'trash');
  if (messagesEl) messagesEl.classList.toggle('hidden', sidebarSelection.kind === 'trash');
  if (promptForm) promptForm.classList.toggle('hidden', sidebarSelection.kind === 'trash');
  if (errorEl) errorEl.classList.toggle('hidden', sidebarSelection.kind === 'trash' || errorEl.textContent === '');

  if (sidebarSelection.kind === 'trash') {
    renderTrash();
    return;
  }

  messagesEl.innerHTML = '';
  messagesEl.classList.toggle('empty', false);

  if (!chat) {
    const layout = document.createElement('div');
    layout.className = 'empty-layout';

    const main = document.createElement('div');
    main.className = 'empty-main';

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'What can I help with?';
    main.appendChild(empty);

    const suggestions = [
      'What can you do?',
      'What are your limitations?',
      'Teach me how to prompt AI.',
      'How do you work behind the scenes?'
    ];

    const chipWrap = document.createElement('div');
    chipWrap.className = 'suggestion-chips';
    suggestions.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-chip';
      btn.textContent = text;
      btn.onclick = () => {
        if (!promptInput) return;
        promptInput.value = text;
        autosizePrompt();
        promptInput.focus();
        const end = promptInput.value.length;
        try {
          promptInput.setSelectionRange(end, end);
        } catch {
          // ignore
        }
      };
      chipWrap.appendChild(btn);
    });

    const swap = document.createElement('div');
    swap.className = 'empty-swap';

    const explainer = document.createElement('div');
    explainer.className = 'temp-chat-explainer';
    explainer.textContent =
      'Temporary chats are not saved to history and won\'t appear in the sidebar. Close or start a new chat to discard it.';

    swap.appendChild(chipWrap);
    swap.appendChild(explainer);

    const syncSwap = (enabled) => {
      if (enabled) {
        chipWrap.style.display = 'none';
        chipWrap.style.opacity = '0';
        explainer.style.display = 'block';
        explainer.style.opacity = '1';
      } else {
        explainer.style.display = 'none';
        explainer.style.opacity = '0';
        chipWrap.style.display = '';
        chipWrap.style.opacity = '1';
      }
    };

    let swapTimer = null;

    const animateSwap = (enabled) => {
      if (swapTimer) {
        window.clearTimeout(swapTimer);
        swapTimer = null;
      }
      if (enabled) {
        chipWrap.style.opacity = '0';
        swapTimer = window.setTimeout(() => {
          if (!temporaryChatEnabled) return;
          chipWrap.style.display = 'none';
          explainer.style.display = 'block';
          explainer.style.opacity = '0';
          requestAnimationFrame(() => {
            explainer.style.opacity = '1';
          });
          swapTimer = null;
        }, 170);
      } else {
        explainer.style.opacity = '0';
        swapTimer = window.setTimeout(() => {
          if (temporaryChatEnabled) return;
          explainer.style.display = 'none';
          chipWrap.style.display = '';
          chipWrap.style.opacity = '0';
          requestAnimationFrame(() => {
            chipWrap.style.opacity = '1';
          });
          swapTimer = null;
        }, 170);
      }
    };

    syncSwap(!!temporaryChatEnabled);

    main.appendChild(swap);
    layout.appendChild(main);

    const toggle = document.createElement('label');
    toggle.className = 'temp-chat-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!temporaryChatEnabled;
    checkbox.onchange = () => {
      temporaryChatEnabled = checkbox.checked;
      animateSwap(!!temporaryChatEnabled);
    };
    const knob = document.createElement('span');
    knob.className = 'temp-chat-switch';
    const text = document.createElement('span');
    text.className = 'temp-chat-toggle-text';
    text.textContent = 'Temporary Chat';
    toggle.appendChild(checkbox);
    toggle.appendChild(knob);
    toggle.appendChild(text);
    layout.appendChild(toggle);

    messagesEl.appendChild(layout);
    messagesEl.appendChild(typingIndicator);
    messagesEl.classList.add('empty');
    return;
  }

  chat.messages.forEach((msg) => {
    messagesEl.appendChild(renderMessageElement(msg));
  });
  messagesEl.appendChild(typingIndicator);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isStreaming) return;
  if (sidebarSelection.kind !== 'chat') return;

  const content = promptInput.value.trim();
  if (!content) return;

  hideError();
  promptInput.value = '';
  autosizePrompt();

  const currentId = sidebarSelection.kind === 'chat' ? sidebarSelection.id : null;
  let chat = currentId === TEMP_CHAT_ID ? tempChat : chats.find((c) => c.id === currentId);
  if (!chat) {
    if (temporaryChatEnabled) {
      temporaryChatEnabled = false;
      tempChat = {
        id: TEMP_CHAT_ID,
        title: 'Temporary chat',
        createdAt: Date.now(),
        messages: []
      };
      sidebarSelection = { kind: 'chat', id: TEMP_CHAT_ID };
      saveUIState();
      chat = tempChat;
    } else {
      const id = await createChat('New chat');
      sidebarSelection = { kind: 'chat', id };
      chat = chats.find((c) => c.id === id);
      saveUIState();
    }
    pendingNew = false;
  }

  const userMsg = { role: 'user', content };
  chat.messages.push(userMsg);
  if (chat.id !== TEMP_CHAT_ID) {
    await saveChat(chat);
  }
  renderActiveChat();
  renderChats();

  await streamAssistant(chat);
}

async function handleDeleteChat(id) {
  await handleTrashChat(id);
}

async function handleTrashChat(id) {
  const chat = chats.find((c) => c.id === id);
  if (!chat) return;
  chat.deletedAt = Date.now();
  await saveChat(chat);
  chats = chats.filter((c) => c.id !== id);
  if (renamingId === id) renamingId = null;
  if (sidebarSelection.kind === 'chat' && sidebarSelection.id === id) {
    sidebarSelection = { kind: 'chat', id: chats[0]?.id || null };
    saveUIState();
  }
  renderChats();
  renderActiveChat();
}

async function restoreChat(id) {
  const trashed = await loadTrashedChats();
  const chat = trashed.find((c) => c.id === id);
  if (!chat) return;
  delete chat.deletedAt;
  await saveChat(chat);
  await purgeExpiredTrashedChats();
  chats = await loadChats();
  if (!activeChatId) activeChatId = chats[0]?.id || null;
  renderChats();
  renderTrash();
}

async function deleteChatPermanently(id) {
  await deleteChat(id);
  await purgeExpiredTrashedChats();
  renderTrash();
}

async function restoreAllTrashedChats() {
  const trashed = await loadTrashedChats();
  if (trashed.length === 0) return;
  await Promise.all(
    trashed.map(async (chat) => {
      delete chat.deletedAt;
      await saveChat(chat);
    })
  );
  chats = await loadChats();
  if (!activeChatId) activeChatId = chats[0]?.id || null;
  renderChats();
  renderTrash();
}

async function deleteAllTrashedChatsPermanently() {
  const trashed = await loadTrashedChats();
  if (trashed.length === 0) return;
  await Promise.all(trashed.map((c) => deleteChat(c.id)));
  renderTrash();
}

async function requestDeleteAllTrashed() {
  const trashed = await loadTrashedChats();
  if (trashed.length === 0) return;
  if (trashed.length === 1) {
    await deleteAllTrashedChatsPermanently();
    return;
  }
  openConfirm(`Delete ${trashed.length} chats permanently? This cannot be undone.`, async () => {
    await deleteAllTrashedChatsPermanently();
  });
}

async function commitRename(id, title) {
  const chat = chats.find((c) => c.id === id);
  if (!chat) {
    renamingId = null;
    renderChats();
    return;
  }
  const nextTitle = title.trim();
  chat.title = nextTitle || chatTitleFromMessages(chat);
  await saveChat(chat);
  renamingId = null;
  renderChats();
}

async function streamAssistant(chat) {
  isStreaming = true;
  typingIndicator.classList.remove('hidden');
  const assistantMsg = { role: 'assistant', content: '' };
  chat.messages.push(assistantMsg);
  renderActiveChat();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: chat.messages.map(({ role, content }) => ({ role, content })),
        stream: true
      })
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        text
          .trim()
          .split('\n')
          .filter(Boolean)
          .forEach((line) => {
            try {
              const json = JSON.parse(line);
              if (json.error) throw new Error(json.error);
              if (json.message && json.message.content) {
                assistantMsg.content += json.message.content;
                renderActiveChat();
              }
              if (json.done) {
                done = true;
              }
            } catch (err) {
              console.error('Stream parse error', err, line);
            }
          });
      }
    }
    if (chat.id !== TEMP_CHAT_ID) {
      await saveChat(chat);
      renderChats();
    }
  } catch (err) {
    showError(err.message || 'Failed to reach Ollama.');
    chat.messages.pop(); // remove assistant placeholder
    if (chat.id !== TEMP_CHAT_ID) {
      await saveChat(chat);
    }
    renderActiveChat();
  } finally {
    isStreaming = false;
    typingIndicator.classList.add('hidden');
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
}

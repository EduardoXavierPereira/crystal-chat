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

let db;
let chats = [];
let activeChatId = null;
let isStreaming = false;
let pendingNew = false;
let renamingId = null;

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
  chats = await loadChats();
  activeChatId = chats[0]?.id || null;
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
    activeChatId = null;
    pendingNew = true;
    renderChats();
    renderActiveChat();
    promptInput.value = '';
    autosizePrompt();
    promptInput.focus();
  });
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
      const sorted = (req.result || []).sort((a, b) => b.createdAt - a.createdAt);
      resolve(sorted);
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

function deleteChat(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite');
    const store = tx.objectStore('chats');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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
  activeChatId = id;
  renderChats();
  renderActiveChat();
}

function renderChats() {
  chatListEl.innerHTML = '';
  chats.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
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
    del.className = 'chat-delete';
    del.setAttribute('aria-label', 'Delete chat');
    del.textContent = '✕';
    del.onclick = async (e) => {
      e.stopPropagation();
      await handleDeleteChat(chat.id);
    };
    actions.appendChild(del);

    item.appendChild(actions);

    chatListEl.appendChild(item);
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
  const chat = chats.find((c) => c.id === activeChatId);
  messagesEl.innerHTML = '';
  messagesEl.classList.toggle('empty', false);
  if (newChatBtn) newChatBtn.classList.toggle('hidden', !chat);

  if (!chat) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'What can I help with?';
    messagesEl.appendChild(empty);

    const suggestions = [
      'What can you do?',
      'What are your limitations?',
      'How can I learn to work with you?',
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
    messagesEl.appendChild(chipWrap);

    messagesEl.appendChild(typingIndicator);
    messagesEl.classList.add('empty');
    return;
  }

  chat.messages.forEach((msg) => {
    messagesEl.appendChild(renderMessageElement(msg));
  });
  messagesEl.appendChild(typingIndicator);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isStreaming) return;

  const content = promptInput.value.trim();
  if (!content) return;

  hideError();
  promptInput.value = '';
  autosizePrompt();

  let chat = chats.find((c) => c.id === activeChatId);
  if (!chat) {
    const id = await createChat('New chat');
    activeChatId = id;
    chat = chats.find((c) => c.id === id);
    pendingNew = false;
  }

  const userMsg = { role: 'user', content };
  chat.messages.push(userMsg);
  await saveChat(chat);
  renderActiveChat();
  renderChats();

  await streamAssistant(chat);
}

async function handleDeleteChat(id) {
  await deleteChat(id);
  chats = chats.filter((c) => c.id !== id);
  if (renamingId === id) renamingId = null;
  if (activeChatId === id) {
    activeChatId = chats[0]?.id || null;
  }
  renderChats();
  renderActiveChat();
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
    await saveChat(chat);
    renderChats();
  } catch (err) {
    showError(err.message || 'Failed to reach Ollama.');
    chat.messages.pop(); // remove assistant placeholder
    await saveChat(chat);
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

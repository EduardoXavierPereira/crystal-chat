import {
  API_URL,
  MODEL,
  TEMP_CHAT_ID,
  TRASH_RETENTION_MS,
  createInitialState,
  loadUIState,
  saveUIState,
  setSidebarSelection
} from './state.js';

import { openDB, loadChats, saveChat, loadTrashedChats, deleteChat, purgeExpiredTrashedChats } from './db.js';
import { streamChat } from './ollama.js';
import {
  getEls,
  chatTitleFromMessages,
  renderChats
} from './sidebar.js';

import { autosizePrompt, showError, hideError, openConfirm, closeConfirm } from './input.js';
import { renderTrash } from './trash.js';
import { renderActiveChat } from './messages.js';

const els = getEls();
const state = createInitialState();

let db;

init();

async function init() {
  if (els.statusEl) els.statusEl.textContent = `Model: ${MODEL} (Ollama)`;
  try {
    const style = document.createElement('style');
    document.head.appendChild(style);
    style.sheet.insertRule('*::-webkit-scrollbar{width:8px}', 0);
    style.remove();
    console.log('[scrollbar] ::-webkit-scrollbar supported');
  } catch (e) {
    console.warn('[scrollbar] ::-webkit-scrollbar NOT supported/ignored by this build', e);
  }
  db = await openDB();
  await purgeExpiredTrashedChats(db, TRASH_RETENTION_MS);
  setInterval(() => {
    purgeExpiredTrashedChats(db, TRASH_RETENTION_MS).catch(() => {
      // ignore
    });
  }, 6 * 60 * 60 * 1000);
  state.chats = await loadChats(db);
  const ui = loadUIState();
  const savedSel = ui?.sidebarSelection;
  if (savedSel && savedSel.kind === 'trash') {
    state.sidebarSelection = { kind: 'trash' };
  } else if (savedSel && savedSel.kind === 'chat') {
    if (savedSel.id === null) {
      state.sidebarSelection = { kind: 'chat', id: null };
    } else if (typeof savedSel.id === 'string' && state.chats.some((c) => c.id === savedSel.id)) {
      state.sidebarSelection = { kind: 'chat', id: savedSel.id };
    } else {
      state.sidebarSelection = { kind: 'chat', id: state.chats[0]?.id || null };
    }
  } else {
    state.sidebarSelection = { kind: 'chat', id: state.chats[0]?.id || null };
  }
  renderChatsUI();
  renderActiveChatUI();
  attachEvents();
  autosizePrompt(els.promptInput);
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) els.promptInput?.focus();
  });
}

function attachEvents() {
  els.promptForm.addEventListener('submit', handleSubmit);
  els.promptInput.addEventListener('input', () => autosizePrompt(els.promptInput));
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  });
  els.newChatBtn.addEventListener('click', async () => {
    state.pendingNew = true;
    applySidebarSelection({ kind: 'chat', id: null });
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    els.promptInput.focus();
  });

  els.trashBtn?.addEventListener('click', () => {
    const nextKind = state.sidebarSelection.kind === 'trash' ? 'chat' : 'trash';
    if (nextKind === 'trash') {
      applySidebarSelection({ kind: 'trash' });
      if (els.trashSearchInput) els.trashSearchInput.focus();
    } else {
      applySidebarSelection({ kind: 'chat', id: state.chats[0]?.id || null });
      els.promptInput?.focus();
    }
  });

  els.trashSearchInput?.addEventListener('input', () => {
    state.trashQuery = (els.trashSearchInput.value || '').trim().toLowerCase();
    renderTrashUI();
  });

  els.trashRestoreAllBtn?.addEventListener('click', async () => {
    await restoreAllTrashedChats();
  });

  els.trashDeleteAllBtn?.addEventListener('click', async () => {
    await requestDeleteAllTrashed();
  });

  els.confirmCancelBtn?.addEventListener('click', () => {
    closeConfirm(els, (v) => (state.confirmAction = v));
  });

  els.confirmOkBtn?.addEventListener('click', async () => {
    const action = state.confirmAction;
    closeConfirm(els, (v) => (state.confirmAction = v));
    if (typeof action === 'function') {
      await action();
    }
  });

  els.confirmModalEl?.addEventListener('click', (e) => {
    if (e.target === els.confirmModalEl) closeConfirm(els, (v) => (state.confirmAction = v));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.confirmModalEl && !els.confirmModalEl.classList.contains('hidden')) {
      closeConfirm(els, (v) => (state.confirmAction = v));
    }
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
  await saveChat(db, chat);
  state.chats = [chat, ...state.chats];
  return id;
}

function setActiveChat(id) {
  applySidebarSelection({ kind: 'chat', id });
}

function applySidebarSelection(next) {
  setSidebarSelection(state, next);
  saveUIState(state);
  renderChatsUI();
  renderActiveChatUI();
}

function renderChatsUI() {
  renderChats({
    els,
    state,
    onSetActiveChat: setActiveChat,
    onStartRename: {
      begin: (id) => {
        state.renamingId = id;
        renderChatsUI();
      },
      cancel: async () => {
        state.renamingId = null;
        renderChatsUI();
      },
      commit: async (id, title) => {
        await commitRename(id, title);
      }
    },
    onTrashChat: handleTrashChat
  });
}

async function renderTrashUI() {
  const trashed = await loadTrashedChats(db);
  renderTrash({
    els,
    trashedChats: trashed,
    trashQuery: state.trashQuery,
    onRestore: restoreChat,
    onDelete: deleteChatPermanently
  });
}

function renderActiveChatUI() {
  renderActiveChat({
    els,
    state,
    tempChatId: TEMP_CHAT_ID,
    tempChat: state.tempChat,
    typingIndicator: els.typingIndicator,
    autosizePrompt
  });

  if (state.sidebarSelection.kind === 'trash') {
    renderTrashUI().catch(() => {
      // ignore
    });
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isStreaming) return;
  if (state.sidebarSelection.kind !== 'chat') return;

  const content = els.promptInput.value.trim();
  if (!content) return;

  hideError(els.errorEl);
  els.promptInput.value = '';
  autosizePrompt(els.promptInput);

  const currentId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  let chat = currentId === TEMP_CHAT_ID ? state.tempChat : state.chats.find((c) => c.id === currentId);
  if (!chat) {
    if (state.temporaryChatEnabled) {
      state.temporaryChatEnabled = false;
      state.tempChat = {
        id: TEMP_CHAT_ID,
        title: 'Temporary chat',
        createdAt: Date.now(),
        messages: []
      };
      state.sidebarSelection = { kind: 'chat', id: TEMP_CHAT_ID };
      saveUIState(state);
      chat = state.tempChat;
    } else {
      const id = await createChat('New chat');
      state.sidebarSelection = { kind: 'chat', id };
      chat = state.chats.find((c) => c.id === id);
      saveUIState(state);
    }
    state.pendingNew = false;
  }

  const userMsg = { role: 'user', content };
  chat.messages.push(userMsg);
  if (chat.id !== TEMP_CHAT_ID) {
    await saveChat(db, chat);
  }
  renderActiveChatUI();
  renderChatsUI();

  await streamAssistant(chat);
}

async function handleDeleteChat(id) {
  await handleTrashChat(id);
}

async function handleTrashChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  chat.deletedAt = Date.now();
  await saveChat(db, chat);
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.renamingId === id) state.renamingId = null;
  if (state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === id) {
    state.sidebarSelection = { kind: 'chat', id: state.chats[0]?.id || null };
    saveUIState(state);
  }
  renderChatsUI();
  renderActiveChatUI();
}

async function restoreChat(id) {
  const trashed = await loadTrashedChats(db);
  const chat = trashed.find((c) => c.id === id);
  if (!chat) return;
  delete chat.deletedAt;
  await saveChat(db, chat);
  await purgeExpiredTrashedChats(db, TRASH_RETENTION_MS);
  state.chats = await loadChats(db);
  renderChatsUI();
  await renderTrashUI();
}

async function deleteChatPermanently(id) {
  await deleteChat(db, id);
  await purgeExpiredTrashedChats(db, TRASH_RETENTION_MS);
  await renderTrashUI();
}

async function restoreAllTrashedChats() {
  const trashed = await loadTrashedChats(db);
  if (trashed.length === 0) return;
  await Promise.all(
    trashed.map(async (chat) => {
      delete chat.deletedAt;
      await saveChat(db, chat);
    })
  );
  state.chats = await loadChats(db);
  renderChatsUI();
  await renderTrashUI();
}

async function deleteAllTrashedChatsPermanently() {
  const trashed = await loadTrashedChats(db);
  if (trashed.length === 0) return;
  await Promise.all(trashed.map((c) => deleteChat(db, c.id)));
  await renderTrashUI();
}

async function requestDeleteAllTrashed() {
  const trashed = await loadTrashedChats(db);
  if (trashed.length === 0) return;
  if (trashed.length === 1) {
    await deleteAllTrashedChatsPermanently();
    return;
  }
  openConfirm(els, `Delete ${trashed.length} chats permanently? This cannot be undone.`, async () => {
    await deleteAllTrashedChatsPermanently();
  }, (v) => (state.confirmAction = v));
}

async function commitRename(id, title) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) {
    state.renamingId = null;
    renderChatsUI();
    return;
  }
  const nextTitle = title.trim();
  chat.title = nextTitle || chatTitleFromMessages(chat);
  await saveChat(db, chat);
  state.renamingId = null;
  renderChatsUI();
}

async function streamAssistant(chat) {
  state.isStreaming = true;
  els.typingIndicator.classList.remove('hidden');
  const assistantMsg = { role: 'assistant', content: '' };
  chat.messages.push(assistantMsg);
  renderActiveChatUI();
  try {
    await streamChat({
      apiUrl: API_URL,
      model: MODEL,
      messages: chat.messages,
      onToken: (token) => {
        assistantMsg.content += token;
        renderActiveChatUI();
      }
    });
    if (chat.id !== TEMP_CHAT_ID) {
      await saveChat(db, chat);
      renderChatsUI();
    }
  } catch (err) {
    showError(els.errorEl, err.message || 'Failed to reach Ollama.');
    chat.messages.pop(); // remove assistant placeholder
    if (chat.id !== TEMP_CHAT_ID) {
      await saveChat(db, chat);
    }
    renderActiveChatUI();
  } finally {
    state.isStreaming = false;
    els.typingIndicator.classList.add('hidden');
  }
}

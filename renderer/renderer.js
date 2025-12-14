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
import { renderPinnedDropdown } from './pinned.js';
import { renderActiveChat } from './messages.js';

const els = getEls();
const state = createInitialState();

let streamAbortController = null;

let spinnerRafId = null;
let spinnerLastTs = 0;
let spinnerAngle = 0;

let db;

function startTypingSpinnerFallback() {
  if (spinnerRafId) return;
  const spinnerEl = els.typingIndicator?.querySelector?.('.spinner');
  if (!spinnerEl) return;

  spinnerLastTs = 0;
  const step = (ts) => {
    if (!els.typingIndicator || els.typingIndicator.classList.contains('hidden')) {
      spinnerRafId = null;
      spinnerLastTs = 0;
      spinnerAngle = 0;
      spinnerEl.style.transform = '';
      return;
    }
    if (!spinnerLastTs) spinnerLastTs = ts;
    const dt = ts - spinnerLastTs;
    spinnerLastTs = ts;

    // Match the original 0.8s CSS duration.
    spinnerAngle = (spinnerAngle + (dt / 800) * 360) % 360;
    spinnerEl.style.transform = `rotate(${spinnerAngle}deg)`;
    spinnerRafId = window.requestAnimationFrame(step);
  };

  spinnerRafId = window.requestAnimationFrame(step);
}

function stopTypingSpinnerFallback() {
  if (spinnerRafId) {
    window.cancelAnimationFrame(spinnerRafId);
    spinnerRafId = null;
  }
  spinnerLastTs = 0;
  spinnerAngle = 0;
  const spinnerEl = els.typingIndicator?.querySelector?.('.spinner');
  if (spinnerEl) spinnerEl.style.transform = '';
}

 function getActiveChat() {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  return activeChatId === TEMP_CHAT_ID ? state.tempChat : state.chats.find((c) => c.id === activeChatId);
 }

 async function copyTextToClipboard(text) {
  const toCopy = (text || '').toString();
  if (!toCopy) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(toCopy);
      return;
    }
  } catch {
    // ignore
  }
  const ta = document.createElement('textarea');
  ta.value = toCopy;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore
  }
  ta.remove();
 }

 async function handleCopyMessage(msg) {
  await copyTextToClipboard(msg?.content || '');
 }

 async function handleRegenerateMessage(msg, messageIndex) {
  if (state.isStreaming) return;
  if (!msg || msg.role !== 'assistant') return;
  if (typeof messageIndex !== 'number' || messageIndex < 1) return;
  if (state.sidebarSelection.kind !== 'chat') return;

  const chat = getActiveChat();
  if (!chat) return;

  const prev = chat.messages[messageIndex - 1];
  if (!prev || prev.role !== 'user') return;

  chat.messages = chat.messages.slice(0, messageIndex);
  hideError(els.errorEl);
  renderActiveChatUI();
  if (chat.id !== TEMP_CHAT_ID) {
    await saveChat(db, chat);
    renderChatsUI();
  }

  await streamAssistant(chat);
 }

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
  state.pinnedOpen = !!(ui?.pinnedOpen ?? ui?.favoritesOpen);
  state.chatQuery = (ui?.chatQuery || '').toString();

  const migrated = [];
  state.chats.forEach((chat) => {
    if (chat.favoriteAt && !chat.pinnedAt) {
      chat.pinnedAt = chat.favoriteAt;
      delete chat.favoriteAt;
      migrated.push(chat);
    }
  });

  if (migrated.length > 0) {
    await Promise.all(migrated.map((c) => saveChat(db, c)));
  }
  if (savedSel && savedSel.kind === 'trash') {
    state.sidebarSelection = { kind: 'trash' };
  } else if (savedSel && savedSel.kind === 'favorites') {
    state.sidebarSelection = { kind: 'chat', id: state.chats[0]?.id || null };
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
  if (els.chatSearchInput) {
    els.chatSearchInput.value = state.chatQuery;
  }
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

  els.sendBtn?.addEventListener('click', (e) => {
    if (!state.isStreaming) return;
    e.preventDefault();
    e.stopPropagation();
    streamAbortController?.abort();
  });

  els.chatSearchInput?.addEventListener('input', () => {
    state.chatQuery = (els.chatSearchInput.value || '').trim().toLowerCase();
    saveUIState(state);
    renderChatsUI();
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

  els.pinnedBtn?.addEventListener('click', () => {
    state.pinnedOpen = !state.pinnedOpen;
    saveUIState(state);
    renderChatsUI();
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
    onTrashChat: handleTrashChat,
    onTogglePinned: togglePinned
  });

  renderPinnedDropdownUI();
}

async function togglePinned(id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  if (chat.pinnedAt || chat.favoriteAt) {
    delete chat.pinnedAt;
    delete chat.favoriteAt;
  } else {
    chat.pinnedAt = Date.now();
  }
  await saveChat(db, chat);
  renderChatsUI();
  renderActiveChatUI();
}

function getPinnedChats() {
  return (state.chats || [])
    .filter((c) => !c.deletedAt && !!c.pinnedAt)
    .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
}

function renderPinnedDropdownUI() {
  if (els.pinnedDropdownEl) {
    els.pinnedDropdownEl.classList.toggle('hidden', !state.pinnedOpen);
  }
  if (!state.pinnedOpen) return;

  renderPinnedDropdown({
    els,
    pinnedChats: getPinnedChats(),
    onOpenChat: (id) => {
      applySidebarSelection({ kind: 'chat', id });
      els.promptInput?.focus();
    }
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
    autosizePrompt,
    onCopyMessage: handleCopyMessage,
    onRegenerateMessage: handleRegenerateMessage
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
  startTypingSpinnerFallback();
  if (els.sendBtn) {
    els.sendBtn.setAttribute('aria-label', 'Pause');
    els.sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />'
      + '<rect x="13.8" y="6" width="3.5" height="12" rx="1" fill="currentColor" />'
      + '</svg>';
  }
  streamAbortController = new AbortController();
  const assistantMsg = {
    role: 'assistant',
    content: '',
    thinking: '',
    _done: false,
    _thinkingActive: false,
    _thinkingOpen: false,
    _thinkingUserToggled: false
  };
  chat.messages.push(assistantMsg);
  renderActiveChatUI();
  try {
    await streamChat({
      apiUrl: API_URL,
      model: MODEL,
      messages: chat.messages,
      signal: streamAbortController.signal,
      onThinking: (token) => {
        if (!assistantMsg._thinkingActive) {
          assistantMsg._thinkingActive = true;
          assistantMsg._thinkingOpen = true;
          assistantMsg._thinkingUserToggled = false;
        }
        assistantMsg.thinking += token;
        renderActiveChatUI();
      },
      onToken: (token) => {
        if (assistantMsg._thinkingActive) {
          assistantMsg._thinkingActive = false;
          if (!assistantMsg._thinkingUserToggled) {
            assistantMsg._thinkingOpen = false;
          }
        }
        assistantMsg.content += token;
        renderActiveChatUI();
      }
    });

    assistantMsg._done = true;
    renderActiveChatUI();
    if (chat.id !== TEMP_CHAT_ID) {
      await saveChat(db, chat);
      renderChatsUI();
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      // user paused
    } else {
      showError(els.errorEl, err.message || 'Failed to reach Ollama.');
      chat.messages.pop(); // remove assistant placeholder
      if (chat.id !== TEMP_CHAT_ID) {
        await saveChat(db, chat);
      }
      renderActiveChatUI();
    }
  } finally {
    state.isStreaming = false;
    els.typingIndicator.classList.add('hidden');
    stopTypingSpinnerFallback();
    streamAbortController = null;
    if (els.sendBtn) {
      els.sendBtn.setAttribute('aria-label', 'Send');
      els.sendBtn.innerHTML = '<span>➤</span>';
    }
  }
}

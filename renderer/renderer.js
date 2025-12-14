import {
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
import { renderActiveChat, updateRenderedMessage } from './messages.js';
import { createCustomDropdown } from './customDropdown.js';
import { formatModelName } from './formatModelName.js';
import { createTrashActions } from './trashActions.js';
import { createPinnedActions } from './pinnedActions.js';
import { createChatSidebarController } from './chatSidebarController.js';
import { createStreamingController } from './streamingController.js';
import { runInit } from './init.js';
import { createSetupController } from './setupController.js';
import { createChatController } from './chatController.js';
import { attachUIBindings } from './uiBindings.js';

const els = getEls();
const state = createInitialState();

let runtimeApiUrl = null;

let db;

let initCompleted = false;
let setupSucceeded = false;

let modelDropdown = null;

let trashActions = null;

let pinnedActions = null;

let chatSidebarController = null;

let streamingController = null;

let setupController = null;

let chatController = null;

const MODEL_OPTIONS = ['qwen3:1.7b', 'qwen3:4b', 'qwen3:8b'].map((m) => ({
  value: m,
  label: formatModelName(m)
}));

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function setModelInstallUI({ visible, label, percent }) {
  if (els.modelInstallEl) els.modelInstallEl.classList.toggle('hidden', !visible);
  if (els.modelInstallLabelEl) els.modelInstallLabelEl.textContent = (label || '').toString();
  const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  if (els.modelInstallPercentEl) els.modelInstallPercentEl.textContent = `${Math.round(p)}%`;
  if (els.modelInstallBarFillEl) els.modelInstallBarFillEl.style.width = `${p}%`;
}

setupController = createSetupController({
  els,
  model: MODEL,
  setModelInstallUI,
  setSetupRetryEnabled,
  showSetupModal,
  onSetupSucceeded: () => {
    setupSucceeded = true;
  }
});

function closePromptToolsPopover() {
  if (!els.promptToolsPopover || !els.promptToolsBtn) return;
  els.promptToolsPopover.classList.add('hidden');
  els.promptToolsBtn.setAttribute('aria-expanded', 'false');
}

function togglePromptToolsPopover() {
  if (!els.promptToolsPopover || !els.promptToolsBtn) return;
  const isOpen = !els.promptToolsPopover.classList.contains('hidden');
  els.promptToolsPopover.classList.toggle('hidden', isOpen);
  els.promptToolsBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
}

function updateStatusText() {
  if (!els.statusEl) return;
  const m = (state.selectedModel || MODEL).toString();
  const label = formatModelName(m) || m;
  const host = runtimeApiUrl ? ` @ ${new URL(runtimeApiUrl).host}` : '';
  els.statusEl.textContent = `Model: ${label} (Ollama${host})`;
}

function updatePromptPlaceholder() {
  if (!els.promptInput) return;
  const m = (state.selectedModel || MODEL).toString();
  const label = formatModelName(m) || m;
  els.promptInput.placeholder = `Message ${label}`;
}

function updateSendButtonEnabled() {
  if (!els.sendBtn || !els.promptInput) return;
  // While streaming, the send button acts as a pause/cancel control.
  if (state.isStreaming) {
    els.sendBtn.disabled = false;
    return;
  }
  const hasText = !!(els.promptInput.value || '').toString().trim();
  els.sendBtn.disabled = !hasText;
}

function setRandomnessSliderFill() {
  if (!els.creativitySlider) return;
  const min = clampNumber(els.creativitySlider.min, 0, 2, 0);
  const max = clampNumber(els.creativitySlider.max, 0, 2, 2);
  const v = clampNumber(els.creativitySlider.value, min, max, 1);
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  els.creativitySlider.style.setProperty('--range-pct', `${pct}%`);
}

function showSetupModal(message) {
  if (!els.setupModalEl) return;
  els.setupModalEl.classList.remove('hidden');
  if (els.setupMessageEl) els.setupMessageEl.textContent = (message || '').toString();
  if (els.setupCloseBtn) {
    els.setupCloseBtn.disabled = !(setupController?.getSetupSucceeded?.() ?? setupSucceeded);
  }
}

function setSetupRetryEnabled(enabled) {
  if (!els.setupRetryBtn) return;
  els.setupRetryBtn.disabled = !enabled;
}

function hideSetupModal() {
  if (!els.setupModalEl) return;
  els.setupModalEl.classList.add('hidden');
}

function appendSetupLogLine(line) {
  if (els.setupMessageEl) {
    const current = (els.setupMessageEl.textContent || '').toString();
    els.setupMessageEl.textContent = current ? current + '\n' + line : line;
  }
}

function isNoisyCliProgressLine(line) {
  const s = (line || '').toString().trim();
  if (!s) return true;
  // Common curl --progress-bar artifacts (prints lots of # and token fragments)
  if (/^#(=|#|O|-|\s)*$/.test(s)) return true;
  if (/^##O[=#-]?\s*$/.test(s)) return true;
  // Fractional percent updates are handled by the % parser; don't spam the log.
  if (/^\d+(\.\d+)?%$/.test(s)) return true;
  return false;
}

async function ensureOllamaAndModel() {
  setupSucceeded = false;
  await setupController?.ensureOllamaAndModel?.();
}

async function continueInitAfterSetup() {
  if (initCompleted) return;
  initCompleted = true;

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
  state.selectedModel = (ui?.selectedModel || state.selectedModel || MODEL).toString();
  state.creativity = clampNumber(ui?.creativity ?? ui?.randomness, 0, 2, state.creativity);
  state.systemPrompt = (ui?.systemPrompt ?? state.systemPrompt ?? '').toString();

  if (els.modelDropdownEl) {
    modelDropdown?.destroy?.();
    modelDropdown = createCustomDropdown({
      rootEl: els.modelDropdownEl,
      options: MODEL_OPTIONS,
      value: state.selectedModel,
      ariaLabel: 'Model',
      onChange: async (next) => {
        state.selectedModel = (next || MODEL).toString();
        saveUIState(state);
        updateStatusText();
        updatePromptPlaceholder();
        try {
          await setupController?.ensureModelInstalled?.(state.selectedModel);
        } catch (e) {
          showError(els.errorEl, e?.message || 'Failed to install model.');
        } finally {
          setModelInstallUI({ visible: false, label: '', percent: 0 });
        }
      }
    });
    setupController?.setModelDropdown?.(modelDropdown);
  }

  if (els.creativitySlider) els.creativitySlider.value = String(state.creativity);
  if (els.creativityValue) els.creativityValue.textContent = state.creativity.toFixed(2);
  if (els.systemPromptInput) els.systemPromptInput.value = state.systemPrompt;
  setRandomnessSliderFill();
  updateStatusText();
  updatePromptPlaceholder();

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
    state.sidebarSelection = { kind: 'chat', id: null };
  } else if (savedSel && savedSel.kind === 'chat') {
    if (savedSel.id === null) {
      state.sidebarSelection = { kind: 'chat', id: null };
    } else if (typeof savedSel.id === 'string' && state.chats.some((c) => c.id === savedSel.id)) {
      state.sidebarSelection = { kind: 'chat', id: savedSel.id };
    } else {
      state.sidebarSelection = { kind: 'chat', id: null };
    }
  } else {
    state.sidebarSelection = { kind: 'chat', id: null };
  }
  pinnedActions = createPinnedActions({
    db,
    els,
    state,
    saveChat,
    renderPinnedDropdown,
    saveUIState,
    applySidebarSelection: (sel) => chatSidebarController?.applySidebarSelection(sel),
    renderChatsUI,
    renderActiveChatUI
  });

  trashActions = createTrashActions({
    db,
    els,
    state,
    trashRetentionMs: TRASH_RETENTION_MS,
    saveUIState,
    renderChatsUI,
    renderActiveChatUI,
    renderTrash,
    openConfirm,
    dbApi: {
      loadChats,
      saveChat,
      loadTrashedChats,
      deleteChat,
      purgeExpiredTrashedChats
    }
  });

  streamingController = createStreamingController({
    els,
    state,
    getApiUrl: () => runtimeApiUrl,
    modelFallback: MODEL,
    tempChatId: TEMP_CHAT_ID,
    clampNumber,
    streamChat,
    updateRenderedMessage,
    renderActiveChatUI,
    renderChatsUI,
    saveChat,
    showError,
    db
  });

  chatSidebarController = createChatSidebarController({
    els,
    state,
    saveUIState,
    setSidebarSelection,
    renderChats,
    renderActiveChatUI,
    commitRename,
    getTrashActions: () => trashActions,
    getPinnedActions: () => pinnedActions
  });

  renderChatsUI();
  renderActiveChatUI();
  chatController = createChatController({
    els,
    state,
    db,
    saveChat,
    saveUIState,
    hideError,
    autosizePrompt,
    updateSendButtonEnabled,
    tempChatId: TEMP_CHAT_ID,
    chatTitleFromMessages,
    renderActiveChatUI,
    renderChatsUI,
    streamAssistant
  });

  attachUIBindings({
    els,
    state,
    autosizePrompt,
    clampNumber,
    saveUIState,
    closeConfirm,
    closePromptToolsPopover,
    togglePromptToolsPopover,
    updateSendButtonEnabled,
    setRandomnessSliderFill,
    renderChatsUI,
    handleSubmit: (e) => chatController?.handleSubmit?.(e),
    abortStreaming: () => streamingController?.abort(),
    applySidebarSelection: (sel) => chatSidebarController?.applySidebarSelection(sel),
    togglePinnedOpen: () => pinnedActions?.togglePinnedOpen(),
    onTrashSearchInput: () => trashActions?.renderTrashUI(),
    onTrashRestoreAll: () => trashActions?.restoreAllTrashedChats(),
    onTrashDeleteAll: () => trashActions?.requestDeleteAllTrashed()
  });
  if (els.chatSearchInput) {
    els.chatSearchInput.value = state.chatQuery;
  }
  autosizePrompt(els.promptInput);
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) els.promptInput?.focus();
  });
}

 function getActiveChat() {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  return activeChatId === TEMP_CHAT_ID ? state.tempChat : state.chats.find((c) => c.id === activeChatId);
 }

 async function handleCopyMessage(msg) {
  await chatController?.handleCopyMessage?.(msg);
}

async function handleRegenerateMessage(msg, messageIndex) {
  await chatController?.handleRegenerateMessage?.(msg, messageIndex);
}

runInit({
  els,
  MODEL,
  setSetupRetryEnabled,
  getSetupSucceeded: () => setupController?.getSetupSucceeded?.() ?? setupSucceeded,
  ensureOllamaAndModel,
  hideSetupModal,
  hideError,
  showSetupModal,
  showError,
  continueInitAfterSetup,
  updateSendButtonEnabled,
  setRuntimeApiUrl: (v) => {
    runtimeApiUrl = v;
  },
  getRuntimeApiUrl: () => runtimeApiUrl
});

// UI bindings extracted to uiBindings.js

function setActiveChat(id) {
  chatSidebarController?.applySidebarSelection({ kind: 'chat', id });
}

function renderChatsUI() {
  chatSidebarController?.renderChatsUI();
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
    trashActions?.renderTrashUI().catch(() => {
      // ignore
    });
  }
}

async function handleSubmit(event) {
  await chatController?.handleSubmit?.(event);
}

async function handleDeleteChat(id) {
  await trashActions?.handleTrashChat(id);
}

async function commitRename(id, title) {
  await chatController?.commitRename?.(id, title);
}

async function streamAssistant(chat) {
  await streamingController?.streamAssistant(chat);
}

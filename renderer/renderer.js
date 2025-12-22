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
import { streamChat, embedText } from './ollama.js';
import {
  getEls,
  chatTitleFromMessages,
  renderChats
} from './sidebar.js';

import { autosizePrompt, showError, hideError, openConfirm, closeConfirm } from './input.js';
import { getDraft } from './utils/draftManager.js';
import { renderTrash } from './trash.js';
import { renderActiveChat, updateRenderedMessage } from './messages.js';
import { createCustomDropdown } from './customDropdown.js';
import { formatModelName } from './formatModelName.js';
import { createTrashActions } from './trashActions.js';
import { FoldersController } from './uiModules/FoldersController.js';
import { createChatSidebarController } from './chatSidebarController.js';
import { createStreamingController } from './streamingController.js';
import { runInit } from './init.js';
import { createSetupController } from './setupController.js';
import { createChatController } from './chatController.js';
import { attachUIBindings } from './uiBindings.js';
import { DEFAULT_EMBEDDING_MODEL } from './memories.js';
import { createMemoriesActions } from './memoriesActions.js';
import { createToggle } from './toggle.js';
import { initDockLayout, setDockStatus } from './dockLayout.js';
import { generateToolToggles } from './tools/uiGenerator.js';
import { createMagneticScrollController } from './ui/magneticScroll.js';
import { getViewElById, focusDockView as focusDockViewUtil } from './dock/dockUtils.js';
import { createPopoverManager } from './ui/popoverManager.js';
import { createThemeManager } from './ui/themeManager.js';
import { createAttachmentState } from './state/attachmentState.js';
import { createUIStateHelpers } from './ui/uiStateHelpers.js';
import { createSetupModal } from './modals/setupModal.js';
import { createUpdateModal } from './modals/updateModal.js';
import { createModelInstallUI } from './ui/modelInstall.js';
import { clampNumber } from './utils/clamp.js';
import { releaseNotesToPlainText } from './utils/releaseNotes.js';
import { MODEL_OPTIONS } from './config/modelOptions.js';
import { wrapSilent, wrapLogged } from './errorHandler.js';

const els = getEls();
const state = createInitialState();

wrapSilent(() => {
  window.__ccState = state;
}, 'expose state to window for debugging');

let runtimeApiUrl = null;

let db;

// Initialize attachment state manager
const attachmentState = createAttachmentState(state, els);
const clearPendingAttachments = () => attachmentState.clear();
const getPendingImages = () => attachmentState.getPendingImages();
const getPendingTextFile = () => attachmentState.getPendingTextFile();
const getPendingFiles = () => attachmentState.getPendingFiles();

// Initialize theme manager
const themeManager = createThemeManager(state);
const applyThemeAndAccent = () => themeManager.applyThemeAndAccent();
const applyReadOnlyMode = (st, e) => themeManager.applyReadOnlyMode(e);

let initCompleted = false;
let setupSucceeded = false;

let modelDropdown = null;
let trashActions = null;
let memoriesActions = null;
let foldersActions = null;
let chatSidebarController = null;
let streamingController = null;
let setupController = null;
let chatController = null;
let dock = null;
let magneticScroll = null;

// Initialize popover manager
const popoverManager = createPopoverManager(els);
const closePromptToolsPopover = () => popoverManager.closePromptToolsPopover();
const togglePromptToolsPopover = () => popoverManager.togglePromptToolsPopover();
const closeChatHeaderToolsPopover = () => popoverManager.closeChatHeaderToolsPopover();
const toggleChatHeaderToolsPopover = () => popoverManager.toggleChatHeaderToolsPopover();

// Initialize dock utilities
const focusDockView = (viewId) => focusDockViewUtil(viewId, dock);

// Initialize UI state helpers
const uiHelpers = createUIStateHelpers(els, state, () => runtimeApiUrl);
const updateStatusText = () => uiHelpers.updateStatusText();
const updatePromptPlaceholder = () => uiHelpers.updatePromptPlaceholder();
const updateSendButtonEnabled = () => uiHelpers.updateSendButtonEnabled();
const setRandomnessSliderFill = () => uiHelpers.setRandomnessSliderFill();
const setTextSizeSliderFill = () => uiHelpers.setTextSizeSliderFill();
const applyChatTextSize = () => uiHelpers.applyChatTextSize();

// Initialize modal managers
const modelInstallUI = createModelInstallUI(els);
const setModelInstallUI = (config) => modelInstallUI.setUI(config);

let setupModalManager = null;
let updateModalManager = null;

const showSetupModal = (message) => {
  if (!setupModalManager) setupModalManager = createSetupModal(els, setupController);
  setupModalManager.show(message);
};

const setSetupRetryEnabled = (enabled) => {
  if (!setupModalManager) setupModalManager = createSetupModal(els, setupController);
  setupModalManager.setRetryEnabled(enabled);
};

const hideSetupModal = () => {
  if (!setupModalManager) setupModalManager = createSetupModal(els, setupController);
  setupModalManager.hide();
};

const showUpdateModal = (payload) => {
  if (!updateModalManager) updateModalManager = createUpdateModal(els);
  updateModalManager.show(payload);
};

const hideUpdateModal = () => {
  if (!updateModalManager) updateModalManager = createUpdateModal(els);
  updateModalManager.hide();
};

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

function attachUpdaterUIBindings() {
  const api = window.electronAPI;
  if (!api?.onUpdateAvailable) return;

  if (!updateModalManager) updateModalManager = createUpdateModal(els);
  updateModalManager.attachBindings(api);
}

async function ensureOllamaAndModel() {
  setupSucceeded = false;
  await setupController?.ensureOllamaAndModel?.();
}

async function continueInitAfterSetup() {
  if (initCompleted) return;
  initCompleted = true;

  try {
    dock = await initDockLayout({
      viewEls: {
        sidebar: getViewElById('sidebar'),
        chat: getViewElById('chat'),
        settings: getViewElById('settings'),
        memories: getViewElById('memories'),
        trash: getViewElById('trash')
      }
    });
  } catch {
    dock = { ok: false, reason: 'dock-init-throw' };
  }

  if (!dock?.ok) {
    // Safe fallback: if the dock layout fails to initialize (e.g. missing dependency),
    // keep the app usable by showing the staged DOM as a normal layout.
    document.documentElement.classList.add('dock-fallback');
    setDockStatus?.(`Dock failed: ${(dock?.reason || 'unknown').toString()}`);
  } else {
    document.documentElement.classList.remove('dock-fallback');
  }

  wrapSilent(() => {
    window.__ccDock = dock;
    window.__ccFocusDockView = focusDockView;
  }, 'expose dock instance to window for debugging');

  try {
    db = await openDB();
  } catch (e) {
    showError(
      els.errorEl,
      'Failed to open local database (IndexedDB). Your local storage may be corrupted. Close the app and back up/reset the app data folder, then try again.'
    );
    return;
  }
  await purgeExpiredTrashedChats(db, TRASH_RETENTION_MS);
  setInterval(() => {
    purgeExpiredTrashedChats(db, TRASH_RETENTION_MS)
      .then(() => {
        wrapLogged(() => {
          window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'purge' } }));
        }, 'dispatch trash changed event');
      })
      .catch((err) => {
        wrapLogged(() => {
          throw err;
        }, 'purge expired trashed chats');
      });
  }, 6 * 60 * 60 * 1000);
  state.chats = await loadChats(db);
  const ui = loadUIState();
  const savedSel = ui?.sidebarSelection;
  state.chatQuery = (ui?.chatQuery || '').toString();
  state.selectedModel = (ui?.selectedModel || state.selectedModel || MODEL).toString();
  state.creativity = clampNumber(ui?.creativity ?? ui?.randomness, 0, 2, state.creativity);
  state.textSize = clampNumber(ui?.textSize, 0.85, 1.25, state.textSize);
  state.magneticScroll = !!ui?.magneticScroll;
  state.systemPrompt = (ui?.systemPrompt ?? state.systemPrompt ?? '').toString();
  state.enableInternet = !!ui?.enableInternet;
  state.updateMemoryEnabled = typeof ui?.updateMemoryEnabled === 'boolean' ? ui.updateMemoryEnabled : state.updateMemoryEnabled;
  state.theme = (ui?.theme || state.theme || 'system').toString();
  state.accent = (ui?.accent || state.accent || '#7fc9ff').toString();
  state.folders = Array.isArray(ui?.folders) ? ui.folders : [];
  state.rootChatIds = Array.isArray(ui?.rootChatIds) ? ui.rootChatIds : [];
  state.homeWidgets = Array.isArray(ui?.homeWidgets) && ui.homeWidgets.length > 0
    ? ui.homeWidgets
    : ['intro', 'suggestions', 'temp-toggle'];
  state.homeEditMode = !!ui?.homeEditMode;
  // Load individual tool states (all default to false if not in localStorage)
  state.toolEnabled_web_search = !!ui?.toolEnabled_web_search;
  state.toolEnabled_open_link = !!ui?.toolEnabled_open_link;
  state.toolEnabled_file_read = !!ui?.toolEnabled_file_read;
  state.toolEnabled_file_write = !!ui?.toolEnabled_file_write;
  state.toolEnabled_file_edit = !!ui?.toolEnabled_file_edit;
  state.toolEnabled_file_glob = !!ui?.toolEnabled_file_glob;
  state.toolEnabled_file_grep = !!ui?.toolEnabled_file_grep;
  state.toolEnabled_folder_browse = !!ui?.toolEnabled_folder_browse;
  clearPendingAttachments();
  applyThemeAndAccent(state);

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
  if (els.textSizeSlider) els.textSizeSlider.value = String(state.textSize);
  if (els.textSizeValue) els.textSizeValue.textContent = state.textSize.toFixed(2);
  if (els.systemPromptInput) els.systemPromptInput.value = state.systemPrompt;

  // Generate dynamic tool toggles
  if (els.toolsTogglesContainerEl) {
    generateToolToggles(els.toolsTogglesContainerEl, state, saveUIState, () => {
      updatePromptPlaceholder();
    });
  }

  if (els.updateMemoryToggleEl) {
    els.updateMemoryToggleEl.innerHTML = '';
    const t = createToggle({
      id: 'update-memory-toggle-input',
      text: '',
      checked: !!state.updateMemoryEnabled,
      switchOnRight: true,
      showText: false,
      onChange: (v) => {
        state.updateMemoryEnabled = !!v;
        saveUIState(state);
      }
    });
    els.updateMemoryToggleEl.appendChild(t.el);
  }

  if (els.magneticScrollToggleEl) {
    els.magneticScrollToggleEl.innerHTML = '';
    const t = createToggle({
      id: 'magnetic-scroll-toggle-input',
      text: '',
      checked: !!state.magneticScroll,
      switchOnRight: true,
      showText: false,
      onChange: (v) => {
        state.magneticScroll = !!v;
        saveUIState(state);
      }
    });
    els.magneticScrollToggleEl.appendChild(t.el);
  }

  if (els.readOnlyToggleEl) {
    els.readOnlyToggleEl.innerHTML = '';
    const t = createToggle({
      id: 'read-only-toggle-input',
      text: '',
      checked: !!state.readOnlyMode,
      switchOnRight: true,
      showText: false,
      onChange: (v) => {
        state.readOnlyMode = !!v;
        saveUIState(state);
        applyReadOnlyMode(state, els);
      }
    });
    els.readOnlyToggleEl.appendChild(t.el);
  }

  applyReadOnlyMode(state, els);

  setRandomnessSliderFill();
  setTextSizeSliderFill();
  applyChatTextSize();
  updateStatusText();
  updatePromptPlaceholder();

  memoriesActions = createMemoriesActions({
    db,
    els,
    state,
    getApiUrl: () => runtimeApiUrl,
    embedText,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    showError
  });
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

  state.pendingNew = state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === null;

  window.addEventListener('cc:trashChat', (e) => {
    const chatId = e?.detail?.chatId;
    if (typeof chatId !== 'string' || !chatId) return;
    trashActions?.handleTrashChat?.(chatId);
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

  // Ensure Trash renders at least once at startup.
  // In dock mode, switching tabs may not go through sidebar button click handlers.
  wrapLogged(() => {
    trashActions?.renderTrashUI?.();
  }, 'render trash UI at startup');

  streamingController = createStreamingController({
    els,
    state,
    getApiUrl: () => runtimeApiUrl,
    modelFallback: MODEL,
    tempChatId: TEMP_CHAT_ID,
    clampNumber,
    streamChat,
    embedText,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    memoryTopK: 6,
    memoryCandidateK: 80,
    memoryMinScore: 0.25,
    memoryRetentionMs: 30 * 24 * 60 * 60 * 1000,
    memoryMaxChars: 2000,
    updateRenderedMessage,
    renderActiveChatUI,
    renderChatsUI,
    saveChat,
    showError,
    db
  });

  wrapLogged(() => {
    memoriesActions?.renderMemoriesUI?.();
  }, 'render memories UI at startup');

  chatSidebarController = createChatSidebarController({
    els,
    state,
    saveUIState,
    setSidebarSelection,
    renderChats,
    renderActiveChatUI,
    commitRename,
    getTrashActions: () => trashActions,
    getFoldersActions: () => foldersActions,
    focusDockView
  });

  renderActiveChatUI();

  if (!magneticScroll && els.messagesEl) {
    magneticScroll = createMagneticScrollController({ els, state });
  }
  chatController = createChatController({
    els,
    state,
    db,
    saveChat,
    saveUIState,
    hideError,
    openConfirm,
    autosizePrompt,
    updateSendButtonEnabled,
    tempChatId: TEMP_CHAT_ID,
    chatTitleFromMessages,
    renderActiveChatUI,
    renderChatsUI,
    streamAssistant,
    getPendingImages,
    getPendingTextFile,
    getPendingFiles,
    clearPendingAttachments
  });

  const bindingsAbort = attachUIBindings({
    els,
    state,
    tempChatId: TEMP_CHAT_ID,
    autosizePrompt,
    clampNumber,
    saveUIState,
    closeConfirm,
    closePromptToolsPopover,
    togglePromptToolsPopover,
    closeChatHeaderToolsPopover,
    toggleChatHeaderToolsPopover,
    updateSendButtonEnabled,
    setRandomnessSliderFill,
    setTextSizeSliderFill,
    applyChatTextSize,
    renderChatsUI,
    handleSubmit: (e) => chatController?.handleSubmit?.(e),
    abortStreaming: () => streamingController?.abort(),
    applySidebarSelection: (sel) => chatSidebarController?.applySidebarSelection(sel),
    focusDockView,
    onMemoriesSearchInput: () => memoriesActions?.renderMemoriesUI(),
    onMemoriesAdd: async (text) => memoriesActions?.addMemoryFromText(text),
    onMemoriesOpen: () => memoriesActions?.renderMemoriesUI(),
    onMemoriesExport: async () => memoriesActions?.exportMemories?.(),
    onMemoriesImport: async () => memoriesActions?.importMemories?.(),
    onMemoriesImportFile: async (file) => memoriesActions?.handleImportFile?.(file),
    onMemoriesImportComplete: async (mode) => memoriesActions?.completeImport?.(mode),
    onTrashSearchInput: () => trashActions?.renderTrashUI(),
    onTrashRestoreAll: () => trashActions?.restoreAllTrashedChats(),
    onTrashDeleteAll: () => trashActions?.requestDeleteAllTrashed(),
    onTrashOpen: () => trashActions?.renderTrashUI()
  });

  // Initialize folders controller with cleanup signal from UI bindings
  foldersActions = new FoldersController({
    els,
    state,
    saveUIState,
    renderChatsUI,
    applySidebarSelection: (sel) => chatSidebarController?.applySidebarSelection(sel),
    openConfirm,
    signal: bindingsAbort.signal
  });

  // Now render chats UI with folders controller fully initialized
  renderChatsUI();

  // Register folder action event handlers
  window.addEventListener('cc:moveChatToFolder', (e) => {
    const chatId = e?.detail?.chatId;
    const folderId = e?.detail?.folderId ?? null;
    if (typeof chatId !== 'string' || !chatId) return;
    foldersActions?.moveChatToFolder?.(chatId, folderId);
  });

  window.addEventListener('cc:removeChatFromFolders', (e) => {
    const chatId = e?.detail?.chatId;
    if (typeof chatId !== 'string' || !chatId) return;
    foldersActions?.removeChatFromFolders?.(chatId);
  });

  window.addEventListener('cc:removeChatFromRoot', (e) => {
    const chatId = e?.detail?.chatId;
    if (typeof chatId !== 'string' || !chatId) return;
    foldersActions?.removeChatFromRoot?.(chatId);
  });

  if (els.chatSearchInput) {
    els.chatSearchInput.value = state.chatQuery;
  }
  autosizePrompt(els.promptInput);
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) els.promptInput?.focus();
  });
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

attachUpdaterUIBindings();

// UI bindings extracted to uiBindings.js

function setActiveChat(id) {
  chatSidebarController?.applySidebarSelection({ kind: 'chat', id });
}

function renderChatsUI() {
  chatSidebarController?.renderChatsUI();
}

function renderActiveChatUI() {
  // Restore draft BEFORE rendering the chat, so it doesn't get overwritten
  const draftToRestore = getDraft();

  renderActiveChat({
    els,
    state,
    tempChatId: TEMP_CHAT_ID,
    tempChat: state.tempChat,
    typingIndicator: els.typingIndicator,
    autosizePrompt,
    saveUIState,
    renderActiveChatUI,
    onCopyMessage: handleCopyMessage,
    onRegenerateMessage: handleRegenerateMessage,
    onDeleteUserMessage: (msg, idx) => chatController?.handleDeleteUserMessage?.(msg, idx),
    onBeginEditUserMessage: (idx) => chatController?.beginEditUserMessage?.(idx),
    onCancelEditUserMessage: () => chatController?.cancelEditUserMessage?.(),
    onApplyEditUserMessage: (idx, content) => chatController?.applyEditUserMessage?.(idx, content),
    onSwitchBranch: (branchId) => chatController?.switchToBranch?.(branchId)
  });

  // Restore draft AFTER rendering (use requestAnimationFrame to ensure it happens after DOM updates)
  if (els.promptInput && draftToRestore) {
    requestAnimationFrame(() => {
      els.promptInput.value = draftToRestore;
      autosizePrompt(els.promptInput);
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

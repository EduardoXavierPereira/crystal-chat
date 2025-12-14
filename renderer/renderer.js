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

const els = getEls();
const state = createInitialState();

let runtimeApiUrl = null;

let db;

let setupUnsub = null;
let initCompleted = false;
let setupSucceeded = false;

let setupLastPullLoggedPct = null;

let modelInstallUnsub = null;
let modelInstallActive = false;
let modelInstallPercent = 0;
let modelInstallTarget = null;

let modelDropdown = null;

let trashActions = null;

let pinnedActions = null;

let chatSidebarController = null;

let streamingController = null;

const MODEL_OPTIONS = ['qwen3:1.7b', 'qwen3:4b', 'qwen3:8b'].map((m) => ({
  value: m,
  label: formatModelName(m)
}));

const SETUP_STEPS = [
  { key: 'install', title: 'Install Ollama', weight: 20 },
  { key: 'start-server', title: 'Start server', weight: 10 },
  { key: 'pull-model', title: `Download model (${MODEL})`, weight: 60 },
  { key: 'finalize', title: 'Finalize', weight: 10 }
];

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

async function ensureModelInstalled(model) {
  const api = window.electronAPI;
  if (!api?.ollamaCheck) return;

  const target = (model || '').toString().trim();
  if (!target) return;

  modelInstallActive = true;
  modelInstallTarget = target;
  modelInstallPercent = 0;
  setModelInstallUI({ visible: true, label: `Checking ${target}…`, percent: 0 });
  modelDropdown?.setDisabled(true);

  if (!modelInstallUnsub && api.onOllamaSetupProgress) {
    modelInstallUnsub = api.onOllamaSetupProgress((payload) => {
      if (!payload || !modelInstallActive) return;
      if (payload.kind === 'stage' && payload.stage === 'pull-model') {
        const msg = payload.message || `Downloading ${modelInstallTarget || ''}…`;
        setModelInstallUI({ visible: true, label: msg, percent: modelInstallPercent });
      }
      if (payload.kind === 'log' && typeof payload.line === 'string') {
        const m = payload.line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        if (m) {
          modelInstallPercent = Math.max(0, Math.min(100, Number(m[1])));
          setModelInstallUI({ visible: true, label: `Downloading ${modelInstallTarget || ''}…`, percent: modelInstallPercent });
        }
      }
    });
  }

  try {
    const initial = await api.ollamaCheck();
    if (!initial?.hasBinary) {
      setModelInstallUI({ visible: true, label: 'Installing Ollama…', percent: 0 });
      const installRes = await api.ollamaInstall();
      if (!installRes?.ok) throw new Error('Ollama install failed.');
    }

    if (!initial?.serverReachable) {
      setModelInstallUI({ visible: true, label: 'Starting server…', percent: 0 });
      const serverRes = await api.ollamaEnsureServer();
      if (!serverRes?.ok) throw new Error('Ollama server not reachable.');
    }

    const has = await api.ollamaHasModel(target);
    if (!has?.ok) {
      modelInstallPercent = 0;
      setModelInstallUI({ visible: true, label: `Downloading ${target}…`, percent: 0 });
      const pull = await api.ollamaPullModel(target);
      if (!pull?.ok) throw new Error('Model download failed.');
      setModelInstallUI({ visible: true, label: `${target} ready.`, percent: 100 });
      await new Promise((r) => setTimeout(r, 400));
    } else {
      setModelInstallUI({ visible: false, label: '', percent: 0 });
    }
  } finally {
    modelInstallActive = false;
    modelInstallTarget = null;
    modelDropdown?.setDisabled(false);
  }
}

const setupStepState = Object.fromEntries(
  SETUP_STEPS.map((s) => [s.key, { status: 'pending', detail: '' }])
);

const setupStagePercent = Object.fromEntries(SETUP_STEPS.map((s) => [s.key, 0]));

function renderSetupSteps() {
  if (!els.setupStepsEl) return;
  els.setupStepsEl.innerHTML = '';
  SETUP_STEPS.forEach((s) => {
    const row = document.createElement('div');
    row.className = `setup-step ${setupStepState[s.key].status}`;

    const title = document.createElement('div');
    title.className = 'setup-step-title';
    title.textContent = s.title;

    const status = document.createElement('div');
    status.className = 'setup-step-status';
    status.textContent = setupStepState[s.key].detail || setupStepState[s.key].status;

    row.appendChild(title);
    row.appendChild(status);
    els.setupStepsEl.appendChild(row);
  });
}

function setSetupOverallProgress({ label, percent }) {
  if (els.setupProgressLabelEl) {
    els.setupProgressLabelEl.textContent = (label || '').toString();
  }
  if (els.setupProgressPercentEl) {
    els.setupProgressPercentEl.textContent = Number.isFinite(percent) ? `${Math.max(0, Math.min(100, percent))}%` : '';
  }
  if (els.setupProgressBarFillEl) {
    const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    els.setupProgressBarFillEl.style.width = `${p}%`;
  }
}

function resetSetupProgressUI() {
  SETUP_STEPS.forEach((s) => {
    setupStepState[s.key].status = 'pending';
    setupStepState[s.key].detail = '';
    setupStagePercent[s.key] = 0;
  });
  renderSetupSteps();
  setSetupOverallProgress({ label: 'Preparing…', percent: 0 });
}

function computeOverallPercent() {
  let total = 0;
  let sum = 0;
  for (const s of SETUP_STEPS) {
    total += s.weight;
    const st = setupStepState[s.key].status;
    if (st === 'done') sum += s.weight;
    if (st === 'active') {
      // If we have a percent signal for the currently active step, use it.
      sum += (s.weight * (setupStagePercent[s.key] || 0)) / 100;
    }
  }
  return total > 0 ? Math.round((sum / total) * 100) : 0;
}

function getActiveSetupStepKey() {
  for (const s of SETUP_STEPS) {
    if (setupStepState[s.key]?.status === 'active') return s.key;
  }
  return null;
}

function setStepStatus(stepKey, status, detail = '') {
  if (!setupStepState[stepKey]) return;
  setupStepState[stepKey].status = status;
  setupStepState[stepKey].detail = detail;
  renderSetupSteps();
  setSetupOverallProgress({
    label: detail || SETUP_STEPS.find((s) => s.key === stepKey)?.title || 'Working…',
    percent: computeOverallPercent()
  });
}

function setStagePercent(stepKey, pct) {
  if (!setupStepState[stepKey]) return;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  setupStagePercent[stepKey] = p;

  // Only show a percent label for stages that are currently active.
  if (setupStepState[stepKey].status === 'active') {
    const baseLabel =
      stepKey === 'pull-model'
        ? 'Downloading model…'
        : SETUP_STEPS.find((s) => s.key === stepKey)?.title || 'Working…';
    setStepStatus(stepKey, 'active', `${baseLabel} ${p}%`);
  } else {
    // Still update the overall bar even if the step isn't active.
    setSetupOverallProgress({ label: els.setupProgressLabelEl?.textContent || 'Working…', percent: computeOverallPercent() });
  }
}

function showSetupModal(message) {
  if (!els.setupModalEl) return;
  els.setupModalEl.classList.remove('hidden');
  if (els.setupMessageEl) els.setupMessageEl.textContent = (message || '').toString();
  if (els.setupCloseBtn) {
    els.setupCloseBtn.disabled = !setupSucceeded;
  }
}

function setSetupMainMessageForStage(stage) {
  if (!els.setupMessageEl) return;
  if (stage === 'install') {
    els.setupMessageEl.textContent =
      'Crystal Chat uses Ollama to run the AI model locally on your computer. Installing Ollama…';
    return;
  }
  if (stage === 'start-server') {
    els.setupMessageEl.textContent = 'Starting server…';
    return;
  }
  if (stage === 'pull-model') {
    els.setupMessageEl.textContent = 'Downloading model…';
    return;
  }
  if (stage === 'finalize') {
    els.setupMessageEl.textContent = 'Finalizing setup…';
    return;
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
  const api = window.electronAPI;
  if (!api?.ollamaCheck) return;

  showSetupModal(`Checking Ollama + ${MODEL}...`);
  resetSetupProgressUI();
  setSetupOverallProgress({ label: `Checking dependencies for ${MODEL}…`, percent: 0 });
  setupSucceeded = false;
  if (els.setupCloseBtn) els.setupCloseBtn.disabled = true;
  setSetupRetryEnabled(false);

  if (!setupUnsub && api.onOllamaSetupProgress) {
    setupUnsub = api.onOllamaSetupProgress((payload) => {
      if (!payload) return;

      if (payload.kind === 'stage') {
        const stage = payload.stage;
        if (stage && setupStepState[stage]) {
          setSetupMainMessageForStage(stage);
          // mark stage active
          Object.keys(setupStepState).forEach((k) => {
            if (setupStepState[k].status === 'active') setupStepState[k].status = 'pending';
          });
          setStepStatus(stage, 'active', payload.message || 'Working…');
        } else {
          setSetupOverallProgress({ label: payload.message || 'Working…', percent: computeOverallPercent() });
        }
      }

      if (payload.kind === 'done') {
        const stage = payload.stage;
        if (stage && setupStepState[stage]) {
          setStepStatus(stage, 'done', payload.message || 'Done');
        }
      }

      if (payload.kind === 'error') {
        const stage = payload.stage;
        if (stage && setupStepState[stage]) {
          setStepStatus(stage, 'error', payload.message || 'Error');
        } else {
          setSetupOverallProgress({ label: payload.message || 'Error', percent: computeOverallPercent() });
        }

        // Only allow retry once we have actually entered an error state.
        setSetupRetryEnabled(true);
      }

      // Convert raw stdout/stderr into a non-scary percent indicator (best effort).
      if (payload.kind === 'log' && typeof payload.line === 'string') {
        const line = payload.line;
        const m = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        if (m) {
          const pct = Math.max(0, Math.min(100, Number(m[1])));
          const activeKey = getActiveSetupStepKey();
          if (activeKey) setStagePercent(activeKey, pct);
          return;
        }
      }
    });
  }

  const initial = await api.ollamaCheck();

  if (!initial.hasBinary) {
    setSetupMainMessageForStage('install');
    setStepStatus('install', 'active', 'Installing Ollama…');
    const installRes = await api.ollamaInstall();
    if (!installRes?.ok) {
      if (els.setupMessageEl) els.setupMessageEl.textContent = 'Failed to install Ollama. Click Retry.';
      throw new Error('Ollama install failed.');
    }
    setStepStatus('install', 'done', 'Installed');
  } else {
    setStepStatus('install', 'done', 'Already installed');
  }

  if (!initial.serverReachable) {
    setSetupMainMessageForStage('start-server');
    setStepStatus('start-server', 'active', 'Starting server…');
    const serverRes = await api.ollamaEnsureServer();
    if (!serverRes?.ok) {
      if (els.setupMessageEl) els.setupMessageEl.textContent = 'Could not start Ollama server. Click Retry.';
      throw new Error('Ollama server not reachable.');
    }
    setStepStatus('start-server', 'done', 'Running');
  } else {
    setStepStatus('start-server', 'done', 'Already running');
  }

  // Use a reliable model check (via /api/show in the main process) instead of tags.
  let hasModel = false;
  if (api.ollamaHasModel) {
    const r = await api.ollamaHasModel(MODEL);
    hasModel = !!r?.ok;
  } else {
    const afterServer = await api.ollamaCheck();
    hasModel = Array.isArray(afterServer.models) && afterServer.models.includes(MODEL);
  }

  if (!hasModel) {
    setSetupMainMessageForStage('pull-model');
    setStepStatus('pull-model', 'active', 'Downloading model…');
    const pullRes = await api.ollamaPullModel(MODEL);
    if (!pullRes?.ok) {
      if (els.setupMessageEl) els.setupMessageEl.textContent = 'Failed to download model. Click Retry.';
      throw new Error('Model download failed.');
    }

    // Confirm model is actually available before closing the modal.
    if (api.ollamaHasModel) {
      setSetupMainMessageForStage('finalize');
      for (let i = 0; i < 30; i++) {
        const chk = await api.ollamaHasModel(MODEL);
        if (chk?.ok) {
          hasModel = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!hasModel) {
      throw new Error(`Model still not available after download: ${MODEL}`);
    }
    setStepStatus('pull-model', 'done', 'Downloaded');
  } else {
    setStepStatus('pull-model', 'done', 'Already installed');
  }

  setSetupMainMessageForStage('finalize');
  setStepStatus('finalize', 'active', 'Finalizing…');
  setupSucceeded = true;
  if (els.setupMessageEl) els.setupMessageEl.textContent = 'Ready.';
  setStepStatus('finalize', 'done', 'Done');
  if (els.setupCloseBtn) els.setupCloseBtn.disabled = false;
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
          await ensureModelInstalled(state.selectedModel);
        } catch (e) {
          showError(els.errorEl, e?.message || 'Failed to install model.');
        } finally {
          setModelInstallUI({ visible: false, label: '', percent: 0 });
        }
      }
    });
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
  chatSidebarController = createChatSidebarController({
    els,
    state,
    saveUIState,
    setSidebarSelection,
    renderChats,
    renderActiveChatUI,
    commitRename,
    getPinnedActions: () => pinnedActions
  });

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

  // Now that controllers exist, wire getters that may have been null during creation.
  // (The controller reads the getter at call-time, so this works fine.)
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
  attachEvents();
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

  // Retry should only be enabled when setup fails.
  setSetupRetryEnabled(false);

  try {
    const api = window.electronAPI;
    if (api?.ollamaGetApiUrl) {
      const r = await api.ollamaGetApiUrl();
      runtimeApiUrl = r?.apiUrl || null;
      if (runtimeApiUrl && els.statusEl) {
        els.statusEl.textContent = `Model: ${MODEL} (Ollama @ ${r?.host || 'local'})`;
      }
    }
  } catch {
    runtimeApiUrl = null;
  }

  if (els.setupCloseBtn) {
    els.setupCloseBtn.addEventListener('click', async () => {
      if (!setupSucceeded) return;
      hideSetupModal();
      hideError(els.errorEl);
      await continueInitAfterSetup();
    });
  }

  if (els.setupRetryBtn) {
    els.setupRetryBtn.addEventListener('click', async () => {
      setSetupRetryEnabled(false);
      try {
        await ensureOllamaAndModel();
        hideError(els.errorEl);
        hideSetupModal();
        await continueInitAfterSetup();
      } catch (e) {
        showSetupModal('Setup failed.');
        showError(els.errorEl, e?.message || 'Setup failed.');
        setSetupRetryEnabled(true);
      }
    });
  }
  try {
    const style = document.createElement('style');
    document.head.appendChild(style);
    style.sheet.insertRule('*::-webkit-scrollbar{width:8px}', 0);
    style.remove();
    console.log('[scrollbar] ::-webkit-scrollbar supported');
  } catch (e) {
    console.warn('[scrollbar] ::-webkit-scrollbar NOT supported/ignored by this build', e);
  }

  try {
    await ensureOllamaAndModel();
    hideSetupModal();
    await continueInitAfterSetup();
  } catch (e) {
    showSetupModal('Setup failed.');
    showError(els.errorEl, e?.message || 'Setup failed.');
    setSetupRetryEnabled(true);
    return;
  }

  updateSendButtonEnabled();
}

function attachEvents() {
  els.promptForm.addEventListener('submit', handleSubmit);
  els.promptInput.addEventListener('input', () => {
    autosizePrompt(els.promptInput);
    updateSendButtonEnabled();
  });
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
    streamingController?.abort();
  });

  els.promptToolsBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePromptToolsPopover();
  });

  document.addEventListener('click', (e) => {
    if (!els.promptToolsPopover || els.promptToolsPopover.classList.contains('hidden')) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (els.promptToolsPopover.contains(t)) return;
    if (els.promptToolsBtn && els.promptToolsBtn.contains(t)) return;
    closePromptToolsPopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePromptToolsPopover();
    }
  });

  if (els.creativitySlider) {
    els.creativitySlider.addEventListener('input', () => {
      state.creativity = clampNumber(els.creativitySlider.value, 0, 2, 1);
      if (els.creativityValue) els.creativityValue.textContent = state.creativity.toFixed(2);
      setRandomnessSliderFill();
      saveUIState(state);
    });
  }

  if (els.systemPromptInput) {
    els.systemPromptInput.addEventListener('input', () => {
      state.systemPrompt = (els.systemPromptInput.value || '').toString();
      saveUIState(state);
    });
  }

  // model dropdown is handled by createCustomDropdown callback

  els.chatSearchInput?.addEventListener('input', () => {
    state.chatQuery = (els.chatSearchInput.value || '').trim().toLowerCase();
    saveUIState(state);
    renderChatsUI();
  });

  els.newChatBtn.addEventListener('click', async () => {
    state.pendingNew = true;
    chatSidebarController?.applySidebarSelection({ kind: 'chat', id: null });
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    els.promptInput.focus();
  });

  els.trashBtn?.addEventListener('click', () => {
    const nextKind = state.sidebarSelection.kind === 'trash' ? 'chat' : 'trash';
    if (nextKind === 'trash') {
      chatSidebarController?.applySidebarSelection({ kind: 'trash' });
      if (els.trashSearchInput) els.trashSearchInput.focus();
    } else {
      chatSidebarController?.applySidebarSelection({ kind: 'chat', id: null });
      els.promptInput?.focus();
    }
  });

  els.pinnedBtn?.addEventListener('click', () => {
    pinnedActions?.togglePinnedOpen();
  });

  els.trashSearchInput?.addEventListener('input', () => {
    state.trashQuery = (els.trashSearchInput.value || '').trim().toLowerCase();
    trashActions?.renderTrashUI();
  });

  els.trashRestoreAllBtn?.addEventListener('click', async () => {
    await trashActions?.restoreAllTrashedChats();
  });

  els.trashDeleteAllBtn?.addEventListener('click', async () => {
    await trashActions?.requestDeleteAllTrashed();
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
  event.preventDefault();
  if (state.isStreaming) return;
  if (state.sidebarSelection.kind !== 'chat') return;

  const content = els.promptInput.value.trim();
  if (!content) return;

  hideError(els.errorEl);
  els.promptInput.value = '';
  autosizePrompt(els.promptInput);
  updateSendButtonEnabled();

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
  await trashActions?.handleTrashChat(id);
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
  await streamingController?.streamAssistant(chat);
}

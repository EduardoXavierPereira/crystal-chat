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
import { renderActiveChat } from './messages.js';
import { createCustomDropdown } from './customDropdown.js';
import { formatModelName } from './formatModelName.js';

const els = getEls();
const state = createInitialState();

let runtimeApiUrl = null;

let streamAbortController = null;

let spinnerRafId = null;
let spinnerLastTs = 0;
let spinnerAngle = 0;

let db;

let setupUnsub = null;
let initCompleted = false;
let setupSucceeded = false;

let modelInstallUnsub = null;
let modelInstallActive = false;
let modelInstallPercent = 0;
let modelInstallTarget = null;

let modelDropdown = null;

const MODEL_OPTIONS = ['qwen3:0.6b', 'qwen3:1.7b', 'qwen3:4b', 'qwen3:8b'].map((m) => ({
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
        const m = payload.line.match(/(\d{1,3})\s*%/);
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
      if (s.key === 'pull-model') {
        sum += (s.weight * (setupStagePercent[s.key] || 0)) / 100;
      } else {
        // Discrete progress for non-download steps.
        sum += s.weight * 0.5;
      }
    }
  }
  return total > 0 ? Math.round((sum / total) * 100) : 0;
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

function hideSetupModal() {
  if (!els.setupModalEl) return;
  els.setupModalEl.classList.add('hidden');
}

async function ensureOllamaAndModel() {
  const api = window.electronAPI;
  if (!api?.ollamaCheck) return;

  showSetupModal(`Checking Ollama + ${MODEL}...`);
  resetSetupProgressUI();
  setSetupOverallProgress({ label: `Checking dependencies for ${MODEL}…`, percent: 0 });
  setupSucceeded = false;
  if (els.setupCloseBtn) els.setupCloseBtn.disabled = true;

  if (!setupUnsub && api.onOllamaSetupProgress) {
    setupUnsub = api.onOllamaSetupProgress((payload) => {
      if (!payload) return;

      if (payload.kind === 'stage') {
        const stage = payload.stage;
        if (stage && setupStepState[stage]) {
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
      }

      // Convert raw stdout/stderr into a non-scary percent indicator (best effort).
      if (payload.kind === 'log' && typeof payload.line === 'string') {
        const line = payload.line;
        const m = line.match(/(\d{1,3})\s*%/);
        if (m) {
          const pct = Math.max(0, Math.min(100, Number(m[1])));
          if (setupStepState['pull-model']?.status === 'active') {
            setStagePercent('pull-model', pct);
          }
        }
      }
    });
  }

  const initial = await api.ollamaCheck();

  if (!initial.hasBinary) {
    if (els.setupMessageEl) {
      els.setupMessageEl.textContent =
        'Crystal Chat uses Ollama to run the AI model locally on your computer. Installing Ollama now…';
    }
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
    setStepStatus('pull-model', 'active', 'Downloading model…');
    const pullRes = await api.ollamaPullModel(MODEL);
    if (!pullRes?.ok) {
      if (els.setupMessageEl) els.setupMessageEl.textContent = 'Failed to download model. Click Retry.';
      throw new Error('Model download failed.');
    }

    // Confirm model is actually available before closing the modal.
    if (api.ollamaHasModel) {
      if (els.setupMessageEl) els.setupMessageEl.textContent = 'Finalizing model install...';
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
      try {
        await ensureOllamaAndModel();
        hideError(els.errorEl);
        hideSetupModal();
        await continueInitAfterSetup();
      } catch (e) {
        showSetupModal('Setup failed.');
        appendSetupLogLine(e?.message || 'Setup failed.');
        showError(els.errorEl, e?.message || 'Setup failed.');
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
    appendSetupLogLine(e?.message || 'Setup failed.');
    showError(els.errorEl, e?.message || 'Setup failed.');
    return;
  }
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
    const sys = (state.systemPrompt || '').toString().trim();
    const sendMessages = sys ? [{ role: 'system', content: sys }, ...chat.messages] : chat.messages;
    await streamChat({
      apiUrl: runtimeApiUrl || 'http://localhost:11434/api/chat',
      model: (state.selectedModel || MODEL).toString(),
      temperature: clampNumber(state.creativity, 0, 2, 1),
      messages: sendMessages,
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

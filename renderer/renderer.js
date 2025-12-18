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
import { renderTrash } from './trash.js';
import { renderPinnedDropdown } from './pinned.js';
import { renderActiveChat, updateRenderedMessage } from './messages.js';
import { createCustomDropdown } from './customDropdown.js';
import { formatModelName } from './formatModelName.js';
import { createTrashActions } from './trashActions.js';
import { createPinnedActions } from './pinnedActions.js';
import { createFoldersActions } from './foldersActions.js';
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

const els = getEls();
const state = createInitialState();

let runtimeApiUrl = null;

let db;

function clearPendingImage() {
  state.pendingImage = null;
  state.pendingTextFile = null;
  els.promptInsertBtn?.classList.remove('has-attachment');
  if (els.promptAttachmentsEl) {
    els.promptAttachmentsEl.innerHTML = '';
    els.promptAttachmentsEl.classList.add('hidden');
  }
}

function getPendingImage() {
  return state?.pendingImage || null;
}

function getPendingTextFile() {
  return state?.pendingTextFile || null;
}

let initCompleted = false;
let setupSucceeded = false;

let updateModalShown = false;

let modelDropdown = null;

let trashActions = null;

let pinnedActions = null;

let memoriesActions = null;

let foldersActions = null;

let chatSidebarController = null;

let streamingController = null;

let setupController = null;

let chatController = null;

let dock = null;

let magneticScroll = null;

function getViewElById(viewId) {
  return document.querySelector(`[data-view-id="${viewId}"]`);
}

function applyThemeAndAccent(state) {
  const resolveTheme = () => {
    const raw = (state?.theme || 'system').toString();
    if (raw === 'dark' || raw === 'light') return raw;
    if (raw !== 'system') return 'dark';
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  };
  try {
    document.documentElement.dataset.theme = resolveTheme();
  } catch {
    // ignore
  }
  try {
    const accent = (state?.accent || '#7fc9ff').toString();
    document.documentElement.style.setProperty('--accent', accent);
  } catch {
    // ignore
  }
}

function createMagneticScrollController({ els, state }) {
  let engaged = false;
  let upImpulse = 0;
  let impulseTimer = null;
  let raf = null;
  let observer = null;

  const nearBottomPx = 90;
  const releaseDistancePx = 260;
  const releaseImpulsePx = 160;

  const getDistanceFromBottom = () => {
    const el = els.messagesEl;
    if (!el) return Infinity;
    const scrollTop = Number.isFinite(el.scrollTop) ? el.scrollTop : 0;
    const clientHeight = Number.isFinite(el.clientHeight) ? el.clientHeight : 0;
    const scrollHeight = Number.isFinite(el.scrollHeight) ? el.scrollHeight : 0;
    return Math.max(0, scrollHeight - (scrollTop + clientHeight));
  };

  const scrollToBottom = () => {
    const el = els.messagesEl;
    if (!el) return;
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = null;
      try {
        el.scrollTop = el.scrollHeight;
      } catch {
        // ignore
      }
    });
  };

  const resetImpulseSoon = () => {
    if (impulseTimer) window.clearTimeout(impulseTimer);
    impulseTimer = window.setTimeout(() => {
      upImpulse = 0;
      impulseTimer = null;
    }, 220);
  };

  const maybeEngageOrHold = () => {
    if (!state.magneticScroll) {
      engaged = false;
      upImpulse = 0;
      return;
    }
    const dist = getDistanceFromBottom();
    if (!engaged) {
      if (dist <= nearBottomPx) {
        engaged = true;
        upImpulse = 0;
        scrollToBottom();
      }
      return;
    }

    if (dist > releaseDistancePx) {
      engaged = false;
      upImpulse = 0;
      return;
    }
    scrollToBottom();
  };

  const onScroll = () => {
    // If the user is engaged and tries to move away slightly, keep them pinned.
    // If they move far away (dragging scrollbar / big gesture), release.
    maybeEngageOrHold();
  };

  const onWheel = (e) => {
    if (!state.magneticScroll) return;
    if (!engaged) return;
    const dy = Number(e?.deltaY);
    if (!Number.isFinite(dy)) return;
    if (dy < 0) {
      upImpulse += Math.abs(dy);
      resetImpulseSoon();
      if (upImpulse >= releaseImpulsePx) {
        engaged = false;
        upImpulse = 0;
      }
    } else {
      // scrolling down reinforces the magnet
      upImpulse = 0;
    }
  };

  const attach = () => {
    const el = els.messagesEl;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    observer = new MutationObserver(() => {
      if (!state.magneticScroll) return;
      if (!engaged) return;
      if (!state.isStreaming) return;
      scrollToBottom();
    });
    observer.observe(el, { subtree: true, childList: true, characterData: true });
  };

  const detach = () => {
    const el = els.messagesEl;
    if (el) {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
    }
    observer?.disconnect?.();
    observer = null;
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = null;
    }
    if (impulseTimer) {
      window.clearTimeout(impulseTimer);
      impulseTimer = null;
    }
    engaged = false;
    upImpulse = 0;
  };

  attach();

  return {
    detach,
    maybeEngageOrHold
  };
}

function focusDockView(viewId) {
  try {
    const gl = dock?.gl;
    const root = gl?.root;
    const items = root?.getItemsByType?.('component') || [];
    const matches = items.filter((it) => it?.config?.componentState?.viewId === viewId);

    const debug = !!window.__ccDebugDockFocus;
    const dbg = (...args) => {
      if (!debug) return;
      try {
        console.debug('[dock] focusDockView', ...args);
      } catch {
        // ignore
      }
    };

    const titleForViewId = (id) => {
      const v = (id || '').toString().trim();
      if (!v) return '';
      if (v === 'sidebar') return 'History';
      if (v === 'chat') return 'Chat';
      if (v === 'settings') return 'Settings';
      if (v === 'memories') return 'Memories';
      if (v === 'trash') return 'Trash';
      return v.slice(0, 1).toUpperCase() + v.slice(1);
    };

    const dispatchTabActivate = (el) => {
      if (!el) return false;
      try {
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch {
        // ignore
      }
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
      } catch {
        // ignore
      }
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch {
        // ignore
      }
      try {
        el.click?.();
      } catch {
        // ignore
      }
      return true;
    };

    // Preferred path: find the containing stack and activate the component within it.
    try {
      const stacks = root?.getItemsByType?.('stack') || [];
      for (const it of matches) {
        const stack = stacks.find((s) => Array.isArray(s?.content) && s.content.includes(it));
        if (!stack) continue;
        dbg('found stack', { viewId, stackId: stack?.id, title: it?.config?.title });

        try {
          if (typeof stack.setActiveContentItem === 'function') {
            stack.setActiveContentItem(it);
            return;
          }
        } catch {
          // ignore
        }

        try {
          if (typeof stack.setActiveComponentItem === 'function') {
            stack.setActiveComponentItem(it);
            return;
          }
        } catch {
          // ignore
        }

        try {
          if (typeof stack.setActiveItem === 'function') {
            stack.setActiveItem(it);
            return;
          }
        } catch {
          // ignore
        }

        try {
          if (typeof stack.setActiveItemIndex === 'function' && Array.isArray(stack.content)) {
            const idx = stack.content.indexOf(it);
            if (idx >= 0) {
              stack.setActiveItemIndex(idx);
              return;
            }
          }
        } catch {
          // ignore
        }
      }
      dbg('no containing stack found (or no stack activation API worked)', { viewId, matches: matches.length });
    } catch {
      // ignore
    }

    const activateViaApi = (item) => {
      let p = item?.parent;
      while (p) {
        try {
          if (typeof p.setActiveContentItem === 'function') {
            p.setActiveContentItem(item);
            return true;
          }
          if (typeof p.setActiveComponentItem === 'function') {
            p.setActiveComponentItem(item);
            return true;
          }
          if (typeof p.setActiveItem === 'function') {
            p.setActiveItem(item);
            return true;
          }
          if (typeof p.setActiveItemIndex === 'function' && Array.isArray(p.content)) {
            const idx = p.content.indexOf(item);
            if (idx >= 0) {
              p.setActiveItemIndex(idx);
              return true;
            }
          }
        } catch {
          // ignore
        }
        p = p.parent;
      }
      return false;
    };

    for (const it of matches) {
      if (activateViaApi(it)) return;
    }

    // DOM fallback: click the corresponding GoldenLayout tab.
    try {
      const rootEl = document.getElementById('dock-root');
      const wantedTitle = titleForViewId(viewId);
      const wanted = wantedTitle.toLowerCase();

      const tabEls = Array.from(rootEl?.querySelectorAll?.('.lm_tab') || []);
      const titleEls = Array.from(rootEl?.querySelectorAll?.('.lm_tab .lm_title') || []);

      const tabByText = tabEls.find((t) => (t?.textContent || '').toString().trim().toLowerCase() === wanted);
      if (tabByText) {
        dbg('dom fallback tab(.lm_tab)', { found: true, title: wantedTitle, viewId });
        if (dispatchTabActivate(tabByText)) return;
      }

      const titleEl = titleEls.find((t) => (t?.textContent || '').toString().trim().toLowerCase() === wanted);
      const tabFromTitle = titleEl?.closest?.('.lm_tab') || titleEl;
      dbg('dom fallback tab(.lm_title)', { found: !!tabFromTitle, title: wantedTitle, viewId });
      if (dispatchTabActivate(tabFromTitle)) return;
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function closePromptToolsPopover() {
  if (!els.promptToolsPopover || !els.promptToolsBtn) return;
  els.promptToolsPopover.classList.add('hidden');
  els.promptToolsBtn.setAttribute('aria-expanded', 'false');
}

const MODEL_OPTIONS = ['qwen3-vl:2b', 'qwen3-vl:4b', 'qwen3-vl:8b'].map((m) => ({
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

function closeChatHeaderToolsPopover() {
  if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
  els.chatHeaderToolsPopover.classList.add('hidden');
  els.chatHeaderToolsBtn.setAttribute('aria-expanded', 'false');
}

function togglePromptToolsPopover() {
  if (!els.promptToolsPopover || !els.promptToolsBtn) return;
  const isOpen = !els.promptToolsPopover.classList.contains('hidden');
  els.promptToolsPopover.classList.toggle('hidden', isOpen);
  els.promptToolsBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
}

function toggleChatHeaderToolsPopover() {
  if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
  const isOpen = !els.chatHeaderToolsPopover.classList.contains('hidden');
  els.chatHeaderToolsPopover.classList.toggle('hidden', isOpen);
  els.chatHeaderToolsBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
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
  const internetHint = state.enableInternet ? ' (Internet on)' : '';
  els.promptInput.placeholder = `Message ${label}${internetHint}`;
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

function setTextSizeSliderFill() {
  if (!els.textSizeSlider) return;
  const min = clampNumber(els.textSizeSlider.min, 0.5, 2, 1);
  const max = clampNumber(els.textSizeSlider.max, 0.5, 2, 1);
  const v = clampNumber(els.textSizeSlider.value, min, max, 1);
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  els.textSizeSlider.style.setProperty('--range-pct', `${pct}%`);
}

function applyChatTextSize() {
  if (!els.messagesEl) return;
  const v = Number.isFinite(state.textSize) ? state.textSize : 1;
  els.messagesEl.style.setProperty('--chat-text-scale', String(v));
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

function showUpdateModal(payload) {
  if (!els.updateModalEl) return;
  if (updateModalShown) return;
  updateModalShown = true;

  const version = payload?.version ? `v${payload.version}` : '';
  const name = (payload?.releaseName || '').toString().trim();
  const title = name || version || 'A new version is available.';

  if (els.updateMessageEl) {
    const lines = [];
    lines.push(title);
    const notes = payload?.releaseNotes;
    if (typeof notes === 'string' && notes.trim()) {
      lines.push('');
      lines.push(notes.trim());
    }
    els.updateMessageEl.textContent = lines.join('\n');
  }

  if (els.updateRestartBtn) {
    els.updateRestartBtn.disabled = false;
    els.updateRestartBtn.textContent = 'Restart and update';
  }

  els.updateModalEl.classList.remove('hidden');
  els.updateLaterBtn?.focus?.();
}

function hideUpdateModal() {
  els.updateModalEl?.classList.add('hidden');
}

function attachUpdaterUIBindings() {
  const api = window.electronAPI;
  if (!api?.onUpdateAvailable) return;

  api.onUpdateAvailable((payload) => {
    showUpdateModal(payload);
  });

  api.onUpdateProgress?.((progress) => {
    if (!els.updateModalEl || els.updateModalEl.classList.contains('hidden')) return;
    const pct = Number(progress?.percent);
    if (!Number.isFinite(pct)) return;
    if (els.updateRestartBtn) {
      els.updateRestartBtn.disabled = true;
      els.updateRestartBtn.textContent = `Downloading… ${Math.round(Math.max(0, Math.min(100, pct)))}%`;
    }
  });

  api.onUpdateDownloaded?.(() => {
    if (els.updateRestartBtn) {
      els.updateRestartBtn.disabled = false;
      els.updateRestartBtn.textContent = 'Restart and update';
    }
  });

  api.onUpdateError?.(() => {
    if (els.updateRestartBtn) {
      els.updateRestartBtn.disabled = false;
      els.updateRestartBtn.textContent = 'Restart and update';
    }
  });

  els.updateLaterBtn?.addEventListener('click', () => {
    hideUpdateModal();
  });

  els.updateRestartBtn?.addEventListener('click', async () => {
    if (!api?.restartAndUpdate) return;
    try {
      if (els.updateRestartBtn) {
        els.updateRestartBtn.disabled = true;
        els.updateRestartBtn.textContent = 'Preparing update…';
      }
      await api.restartAndUpdate();
    } catch {
      if (els.updateRestartBtn) {
        els.updateRestartBtn.disabled = false;
        els.updateRestartBtn.textContent = 'Restart and update';
      }
    }
  });

  els.updateModalEl?.addEventListener('click', (e) => {
    if (e.target === els.updateModalEl) hideUpdateModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.updateModalEl && !els.updateModalEl.classList.contains('hidden')) {
      hideUpdateModal();
    }
  });
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

  try {
    window.__ccDock = dock;
    window.__ccFocusDockView = focusDockView;
  } catch {
    // ignore
  }

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
        try {
          window.dispatchEvent(new CustomEvent('cc:trashChanged', { detail: { reason: 'purge' } }));
        } catch {
          // ignore
        }
      })
      .catch(() => {
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
  state.textSize = clampNumber(ui?.textSize, 0.85, 1.25, state.textSize);
  state.magneticScroll = !!ui?.magneticScroll;
  state.systemPrompt = (ui?.systemPrompt ?? state.systemPrompt ?? '').toString();
  state.enableInternet = !!ui?.enableInternet;
  state.updateMemoryEnabled = typeof ui?.updateMemoryEnabled === 'boolean' ? ui.updateMemoryEnabled : state.updateMemoryEnabled;
  state.theme = (ui?.theme || state.theme || 'system').toString();
  state.accent = (ui?.accent || state.accent || '#7fc9ff').toString();
  state.folders = Array.isArray(ui?.folders) ? ui.folders : [];
  clearPendingImage();
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

  if (els.enableInternetToggleEl) {
    els.enableInternetToggleEl.innerHTML = '';
    const t = createToggle({
      id: 'enable-internet-toggle-input',
      text: '',
      checked: !!state.enableInternet,
      switchOnRight: true,
      showText: false,
      onChange: (v) => {
        state.enableInternet = !!v;
        saveUIState(state);
        updatePromptPlaceholder();
      }
    });
    els.enableInternetToggleEl.appendChild(t.el);
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

  setRandomnessSliderFill();
  setTextSizeSliderFill();
  applyChatTextSize();
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

  memoriesActions = createMemoriesActions({
    db,
    els,
    state,
    getApiUrl: () => runtimeApiUrl,
    embedText,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    showError
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

  state.pendingNew = state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === null;
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

  foldersActions = createFoldersActions({
    els,
    state,
    saveUIState,
    renderChatsUI,
    applySidebarSelection: (sel) => chatSidebarController?.applySidebarSelection(sel)
  });

  foldersActions?.attachBindings?.();

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
  try {
    trashActions?.renderTrashUI?.();
  } catch {
    // ignore
  }

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

  try {
    memoriesActions?.renderMemoriesUI?.();
  } catch {
    // ignore
  }

  chatSidebarController = createChatSidebarController({
    els,
    state,
    saveUIState,
    setSidebarSelection,
    renderChats,
    renderActiveChatUI,
    commitRename,
    getTrashActions: () => trashActions,
    getPinnedActions: () => pinnedActions,
    getFoldersActions: () => foldersActions,
    focusDockView
  });

  renderChatsUI();
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
    getPendingImage,
    getPendingTextFile,
    clearPendingImage
  });

  attachUIBindings({
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
    togglePinnedOpen: () => pinnedActions?.togglePinnedOpen(),
    togglePinnedChat: async (id) => pinnedActions?.togglePinned(id),
    onMemoriesSearchInput: () => memoriesActions?.renderMemoriesUI(),
    onMemoriesAdd: async (text) => memoriesActions?.addMemoryFromText(text),
    onMemoriesOpen: () => memoriesActions?.renderMemoriesUI(),
    onTrashSearchInput: () => trashActions?.renderTrashUI(),
    onTrashRestoreAll: () => trashActions?.restoreAllTrashedChats(),
    onTrashDeleteAll: () => trashActions?.requestDeleteAllTrashed(),
    onTrashOpen: () => trashActions?.renderTrashUI()
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
  renderActiveChat({
    els,
    state,
    tempChatId: TEMP_CHAT_ID,
    tempChat: state.tempChat,
    typingIndicator: els.typingIndicator,
    autosizePrompt,
    onCopyMessage: handleCopyMessage,
    onRegenerateMessage: handleRegenerateMessage,
    onDeleteUserMessage: (msg, idx) => chatController?.handleDeleteUserMessage?.(msg, idx),
    onBeginEditUserMessage: (idx) => chatController?.beginEditUserMessage?.(idx),
    onCancelEditUserMessage: () => chatController?.cancelEditUserMessage?.(),
    onApplyEditUserMessage: (idx, content) => chatController?.applyEditUserMessage?.(idx, content),
    onSwitchBranch: (branchId) => chatController?.switchToBranch?.(branchId)
  });
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

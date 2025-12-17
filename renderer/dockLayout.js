const LAYOUT_KEY = 'crystal-chat:layout-v2';
const LEGACY_LAYOUT_KEY = 'crystal-chat:layout-v1';

function safeParseJson(raw) {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function enforceSidebarStackWidth(item, width) {
  if (!item || typeof item !== 'object') return;

  if (item.type === 'stack' && Array.isArray(item.content)) {
    const hasSidebar = item.content.some(
      (c) => c?.type === 'component' && c?.componentState?.viewId === 'sidebar'
    );
    if (hasSidebar) {
      // Preserve user-resized widths; only apply a default when width is missing.
      if (typeof item.width !== 'number') item.width = width;
    }
  }

  if (Array.isArray(item.content)) {
    item.content.forEach((c) => enforceSidebarStackWidth(c, width));
  }
}

function safeStringifyJson(value) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'function') return undefined;
      if (v && typeof v === 'object') {
        if (v.nodeType || v === window) return undefined;
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
      return v;
    });
  } catch {
    return null;
  }
}

function isLayoutConfigLike(obj) {
  return !!obj && typeof obj === 'object' && (obj.root || obj.content);
}

function extractLayoutRoot(config) {
  if (!config || typeof config !== 'object') return null;
  if (config.root && typeof config.root === 'object') return config.root;
  if (Array.isArray(config.content) && config.content[0] && typeof config.content[0] === 'object') {
    return config.content[0];
  }
  return null;
}

export function clearSavedDockLayout() {
  try {
    localStorage.removeItem(LAYOUT_KEY);
    localStorage.removeItem(LEGACY_LAYOUT_KEY);
  } catch {
    // ignore
  }
}

export function loadSavedDockLayout() {
  const parsed = safeParseJson(localStorage.getItem(LAYOUT_KEY));
  if (isLayoutConfigLike(parsed)) return parsed;

  // Migrate legacy layouts forward.
  const legacy = safeParseJson(localStorage.getItem(LEGACY_LAYOUT_KEY));
  if (!isLayoutConfigLike(legacy)) return null;
  try {
    const migrated = normalizeLayoutConfig(legacy);
    const raw = safeStringifyJson(migrated);
    if (raw) {
      localStorage.setItem(LAYOUT_KEY, raw);
      localStorage.removeItem(LEGACY_LAYOUT_KEY);
    }
  } catch {
    // ignore
  }
  return legacy;
}

export function saveDockLayout(config) {
  const normalized = normalizeLayoutConfig(config);
  const raw = safeStringifyJson(normalized);
  if (!raw) return;
  try {
    localStorage.setItem(LAYOUT_KEY, raw);
  } catch {
    // ignore
  }
}

function getDefaultLayoutConfig() {
  return {
    settings: {
      hasHeaders: true,
      constrainDragToContainer: true,
      reorderEnabled: true,
      selectionEnabled: true,
      popoutWholeStack: false,
      blockedPopoutsThrowError: true,
      closePopoutsOnUnload: true,
      showPopoutIcon: false,
      showMaximiseIcon: false,
      showCloseIcon: false
    },
    header: {
      // We set close to false globally, but the patch below forces dragging to work anyway.
      close: false,
      maximise: true
    },
    dimensions: {
      borderWidth: 5,
      minItemHeight: 120,
      minItemWidth: 180,
      headerHeight: 34,
      dragProxyWidth: 300,
      dragProxyHeight: 200
    },
    content: [
      {
        type: 'row',
        isClosable: true,
        content: [
          {
            type: 'stack',
            isClosable: true,
            activeItemIndex: 0,
            width: 33,
            content: [
              {
                type: 'component',
                componentType: 'view',
                title: 'History',
                componentState: { viewId: 'sidebar' },
                isClosable: true
              },
              {
                type: 'component',
                componentType: 'view',
                title: 'Settings',
                componentState: { viewId: 'settings' },
                isClosable: true
              },
              {
                type: 'component',
                componentType: 'view',
                title: 'Memories',
                componentState: { viewId: 'memories' },
                isClosable: true
              },
              {
                type: 'component',
                componentType: 'view',
                title: 'Trash',
                componentState: { viewId: 'trash' },
                isClosable: true
              }
            ]
          },
          {
            type: 'column',
            isClosable: true,
            width: 78,
            content: [
              {
                isClosable: true,
                type: 'stack',
                activeItemIndex: 0,
                height: 100,
                content: [
                  {
                    type: 'component',
                    componentType: 'view',
                    title: 'Chat',
                    componentState: { viewId: 'chat' },
                    isClosable: true
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function wrapComponentItemsInStack(item, parentType = null) {
  if (!item || typeof item !== 'object') return item;
  const t = item.type;

  if (t === 'component') {
    const { width, height } = item;
    const { content: _content, ...rest } = item;
    const component = { ...rest, type: 'component', isClosable: true };

    if (parentType === 'stack') {
      return component;
    }

    const stack = {
      type: 'stack',
      isClosable: true,
      activeItemIndex: 0,
      content: [component]
    };
    if (typeof width === 'number') stack.width = width;
    if (typeof height === 'number') stack.height = height;
    return stack;
  }

  const next = { ...item };
  if (Array.isArray(next.content)) {
    next.content = next.content.map((c) => wrapComponentItemsInStack(c, t));
  }
  return next;
}

function ensureSettingsInSidebarStack(item) {
  if (!item || typeof item !== 'object') return;

  if (item.type === 'stack' && Array.isArray(item.content)) {
    const content = item.content;
    const hasSidebar = content.some((c) => c?.type === 'component' && c?.componentState?.viewId === 'sidebar');
    if (hasSidebar) {
      const hasSettings = content.some((c) => c?.type === 'component' && c?.componentState?.viewId === 'settings');
      if (!hasSettings) {
        const insertAfter = content.findIndex((c) => c?.type === 'component' && c?.componentState?.viewId === 'sidebar');
        const settingsComp = {
          type: 'component',
          componentType: 'view',
          title: 'Settings',
          componentState: { viewId: 'settings' },
          isClosable: true
        };
        const idx = insertAfter >= 0 ? insertAfter + 1 : 0;
        content.splice(idx, 0, settingsComp);
      }
    }
  }

  if (Array.isArray(item.content)) {
    item.content.forEach((c) => ensureSettingsInSidebarStack(c));
  }
}

function sanitizeItemConfig(item) {
  if (!item || typeof item !== 'object') return item;
  const t = item.type;

  const stripCommon = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const next = { ...obj };
    delete next.size;
    delete next.sizeUnit;
    delete next.minSize;
    delete next.minSizeUnit;
    delete next.maximised;
    delete next.reorderEnabled;
    if (next.id === '') delete next.id;
    return next;
  };

  if (t === 'component') {
    const { content: _content, ...rest } = item;
    return stripCommon({ ...rest, type: 'component' });
  }

  const next = stripCommon(item);
  if (Array.isArray(next.content)) {
    next.content = next.content.map((c) => sanitizeItemConfig(c));
  }
  return next;
}

function normalizeLayoutConfig(config) {
  if (!config || typeof config !== 'object') return config;
  const next = { ...config };
  
  // Ensure default settings are applied
  if (!next.settings) next.settings = {};
  next.settings.showCloseIcon = false; 
  next.settings.hasHeaders = true;
  next.settings.showMaximiseIcon = false;

  if (!next.root && Array.isArray(next.content) && next.content.length > 0) {
    next.root = next.content[0];
    delete next.content;
  }
  if (next.root) {
    next.root = sanitizeItemConfig(wrapComponentItemsInStack(next.root, null));
    ensureSettingsInSidebarStack(next.root);
    enforceSidebarStackWidth(next.root, 33);
  }
  return next;
}

function ensureGlobalEscapeHatch() {
  const existing = document.getElementById('dock-toolbar');
  if (existing) return;

  const bar = document.createElement('div');
  bar.id = 'dock-toolbar';

  const btn = document.createElement('button');
  btn.id = 'dock-reset-layout';
  btn.type = 'button';
  btn.className = 'button button-ghost';
  btn.textContent = 'Reset layout';

  btn.addEventListener('click', () => {
    clearSavedDockLayout();
    window.location.reload();
  });

  const status = document.createElement('div');
  status.id = 'dock-status';

  bar.appendChild(btn);
  bar.appendChild(status);
  document.body.appendChild(bar);
}

export function setDockStatus(text) {
  const el = document.getElementById('dock-status');
  if (!el) return;
  el.textContent = (text || '').toString();
}

function moveToBodyIfPresent(id) {
  const el = document.getElementById(id);
  if (!el) return;
  document.body.appendChild(el);
}

// Forces tabs to be draggable even if they are the only one in the stack.
function patchGoldenLayoutSingleTabDrag(bundle) {
  if (!bundle || typeof bundle !== 'object') return;
  if (bundle.__ccPatchedSingleTabDrag) return;

  const Header = bundle.Header;
  if (!Header || !Header.prototype) return;

  const origUpdateClosability = Header.prototype.updateClosability;
  if (typeof origUpdateClosability === 'function') {
    Header.prototype.updateClosability = function patchedUpdateClosability(...args) {
      const res = origUpdateClosability.apply(this, args);
      try {
        // FORCE drag capability. 
        // We handle "closability" visually by hiding the close button via CSS.
        this._canRemoveComponent = true;
      } catch {
        // ignore
      }
      return res;
    };
  }

  bundle.__ccPatchedSingleTabDrag = true;
}

// Inject styles to hide staging area and force hide close buttons
function injectDockStyles() {
  if (document.getElementById('dock-fixes')) return;
  const style = document.createElement('style');
  style.id = 'dock-fixes';
  style.textContent = `
    #view-staging { display: none !important; }
    .lm_close_tab { display: none !important; }
    .lm_maximise { display: none !important; }
    .lm_minimise { display: none !important; }
    .lm_header .lm_tab { padding-right: 10px !important; } 
  `;
  document.head.appendChild(style);
}

function suppressDockTabTooltips(rootEl) {
  if (!rootEl || rootEl.__ccSuppressTooltipsAttached) return;

  const scrub = (node) => {
    const el = node && node.nodeType === 1 ? node : null;
    if (!el) return;

    const targets = [];
    if (el.matches?.('.lm_tab, .lm_tab .lm_title')) targets.push(el);
    try {
      targets.push(...Array.from(el.querySelectorAll?.('.lm_tab, .lm_tab .lm_title') || []));
    } catch {
      // ignore
    }

    targets.forEach((t) => {
      try {
        t.removeAttribute('title');
      } catch {
        // ignore
      }
    });
  };

  scrub(rootEl);

  const obs = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type === 'attributes') {
        scrub(m.target);
      }
      if (m.type === 'childList') {
        m.addedNodes?.forEach?.((n) => scrub(n));
      }
    });
  });

  obs.observe(rootEl, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title']
  });

  rootEl.__ccSuppressTooltipsAttached = true;
  rootEl.__ccSuppressTooltipsObserver = obs;
}

function createDockLayoutSaver(gl, rootEl) {
  let timer = null;

  const getConfig = () => {
    try {
      const raw =
        typeof gl?.saveLayout === 'function'
          ? gl.saveLayout()
          : (typeof gl?.toConfig === 'function' ? gl.toConfig() : null);
      const root = extractLayoutRoot(raw);
      if (!root) return null;

      // Persist a minimal config that matches what GoldenLayout loadLayout expects.
      // Some configs returned by toConfig/saveLayout include internal/resolved fields
      // (eg numeric+unit split) that can break parsing on reload.
      const base = getDefaultLayoutConfig();
      const minimal = { ...base, root };
      delete minimal.content;
      delete minimal.openPopouts;
      delete minimal.resolved;
      return minimal;
    } catch {
      return null;
    }
  };

  const flush = () => {
    try {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      const next = getConfig();
      if (next) {
        saveDockLayout(next);
      }
    } catch {
      // ignore
    }

    try {
      suppressDockTabTooltips(rootEl);
    } catch {
      // ignore
    }
  };

  const schedule = () => {
    try {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 150);
    } catch {
      // ignore
    }
  };

  return { schedule, flush };
}

export async function initDockLayout({ viewEls }) {
  injectDockStyles();
  moveToBodyIfPresent('confirm-modal');
  moveToBodyIfPresent('setup-modal');

  const rootEl = document.getElementById('dock-root');
  if (!rootEl) return { ok: false, reason: 'dock-root-missing' };

  suppressDockTabTooltips(rootEl);

  const GoldenLayout = window?.GoldenLayoutBundle?.GoldenLayout;
  if (!GoldenLayout) return { ok: false, reason: 'golden-layout-bundle-missing' };

  // 1. APPLY THE PATCH
  patchGoldenLayoutSingleTabDrag(window?.GoldenLayoutBundle);

  const saved = loadSavedDockLayout();
  const hadSaved = !!saved;
  const defaultConfig = normalizeLayoutConfig(getDefaultLayoutConfig());
  const config = saved || defaultConfig;

  let gl;
  try {
    gl = new GoldenLayout(rootEl);
  } catch {
    return { ok: false, reason: 'golden-layout-ctor-failed' };
  }

  const saver = createDockLayoutSaver(gl, rootEl);

  // Fallback persistence: some GoldenLayout builds miss stateChanged for certain interactions.
  // Save on interaction end events while the user is manipulating the dock.
  try {
    const isInDock = (t) => {
      try {
        return !!(t && rootEl && (t === rootEl || rootEl.contains(t)));
      } catch {
        return false;
      }
    };

    const scheduleIfDockTarget = (e) => {
      if (!isInDock(e?.target)) return;
      saver.schedule();
    };

    window.addEventListener('pointerup', scheduleIfDockTarget, true);
    window.addEventListener('mouseup', scheduleIfDockTarget, true);
    window.addEventListener('touchend', scheduleIfDockTarget, true);
    window.addEventListener('keyup', scheduleIfDockTarget, true);
    window.addEventListener('resize', () => saver.schedule(), { passive: true });
  } catch {
    // ignore
  }

  // Additional GL events (when available)
  try {
    gl.on?.('itemDropped', () => saver.schedule());
    gl.on?.('itemCreated', () => saver.schedule());
    gl.on?.('itemDestroyed', () => saver.schedule());
  } catch {
    // ignore
  }

  gl.registerComponentFactoryFunction('view', (container, componentState) => {
    const viewId = componentState?.viewId;
    const el = viewEls?.[viewId];

    const wrap = document.createElement('div');
    wrap.className = 'dock-view-wrap';

    if (el) {
      el.classList.remove('hidden');
      wrap.appendChild(el);
    } else {
      const missing = document.createElement('div');
      missing.className = 'dock-view-missing';
      missing.textContent = `Missing view: ${(viewId || 'unknown').toString()}`;
      wrap.appendChild(missing);
    }

    container.element.appendChild(wrap);

    try {
      suppressDockTabTooltips(rootEl);
    } catch {
      // ignore
    }

    container.on('destroy', () => {
      const staging = document.getElementById('view-staging');
      if (staging && el && el.parentElement) {
        staging.appendChild(el);
      }
    });
  });

  // 2. NO PRUNING LOGIC HERE. 
  // We just save the state. Golden Layout handles stack destruction automatically.
  gl.on('stateChanged', () => {
    saver.schedule();
  });

  try {
    window.addEventListener('beforeunload', () => saver.flush());
  } catch {
    // ignore
  }

  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saver.flush();
    });
  } catch {
    // ignore
  }

  const tryLoad = (cfg) => {
    if (typeof gl.loadLayout !== 'function') {
      return { ok: false, reason: 'golden-layout-loadLayout-missing' };
    }
    gl.loadLayout(cfg);
    return { ok: true };
  };

  try {
    tryLoad(cfgOrThrow(config));
  } catch (e) {
    try {
      tryLoad(cfgOrThrow(defaultConfig));
    } catch (e2) {
      return { ok: false, reason: 'layout-init-failed' };
    }
  }

  function cfgOrThrow(v) {
    if (!v || typeof v !== 'object') throw new Error('Invalid layout config');
    return v;
  }

  // On reload (Ctrl+R), GoldenLayout may take a moment to attach its DOM.
  // A single RAF check can falsely report an "empty" layout and wipe the saved config.
  // Wait a short time window before concluding the dock is empty.
  const waitForDockContent = async () => {
    const maxFrames = 25;
    for (let i = 0; i < maxFrames; i++) {
      await new Promise((r) => requestAnimationFrame(() => r()));
      const hasContent = rootEl.querySelector('.lm_content') || rootEl.querySelector('.lm_item');
      if (hasContent) return true;
    }
    return false;
  };

  const hasContent = await waitForDockContent();
  void hasContent;

  // On first run (no saved layout), persist the default layout after the dock has settled.
  // Avoid saving immediately when a saved layout exists, otherwise we can overwrite it
  // with an intermediate/default state during initialization.
  if (!hadSaved) {
    try {
      window.setTimeout(() => saver.flush(), 500);
    } catch {
      // ignore
    }
  }

  return { ok: true, gl };
}
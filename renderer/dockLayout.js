const LAYOUT_KEY = 'crystal-chat:layout-v1';

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
      item.width = width;
    }
  }

  if (Array.isArray(item.content)) {
    item.content.forEach((c) => enforceSidebarStackWidth(c, width));
  }
}

function safeStringifyJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isLayoutConfigLike(obj) {
  return !!obj && typeof obj === 'object' && (obj.root || obj.content);
}

export function clearSavedDockLayout() {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // ignore
  }
}

export function loadSavedDockLayout() {
  const parsed = safeParseJson(localStorage.getItem(LAYOUT_KEY));
  if (!isLayoutConfigLike(parsed)) return null;
  return parsed;
}

export function saveDockLayout(config) {
  const raw = safeStringifyJson(config);
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

export async function initDockLayout({ viewEls }) {
  injectDockStyles();
  moveToBodyIfPresent('confirm-modal');
  moveToBodyIfPresent('setup-modal');

  const rootEl = document.getElementById('dock-root');
  if (!rootEl) return { ok: false, reason: 'dock-root-missing' };

  const GoldenLayout = window?.GoldenLayoutBundle?.GoldenLayout;
  if (!GoldenLayout) return { ok: false, reason: 'golden-layout-bundle-missing' };

  // 1. APPLY THE PATCH
  patchGoldenLayoutSingleTabDrag(window?.GoldenLayoutBundle);

  const saved = loadSavedDockLayout();
  const defaultConfig = normalizeLayoutConfig(getDefaultLayoutConfig());
  const config = normalizeLayoutConfig(saved || defaultConfig);

  let gl;
  try {
    gl = new GoldenLayout(rootEl);
  } catch {
    return { ok: false, reason: 'golden-layout-ctor-failed' };
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
    try {
      if (gl.isInitialised) {
        const next = typeof gl.saveLayout === 'function'
          ? gl.saveLayout()
          : (typeof gl.toConfig === 'function' ? gl.toConfig() : null);
        if (next) saveDockLayout(next);
      }
    } catch {
      // ignore
    }
  });

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
    clearSavedDockLayout();
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

  await new Promise((r) => requestAnimationFrame(() => r()));
  const hasContent = rootEl.querySelector('.lm_content') || rootEl.querySelector('.lm_item');
  if (!hasContent) {
    clearSavedDockLayout();
    return { ok: false, reason: 'empty-layout' };
  }

  return { ok: true, gl };
}
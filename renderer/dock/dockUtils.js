/**
 * Dock layout utilities for GoldenLayout integration
 * Handles focusing specific dock views and managing the dock layout
 */

import { wrapLogged, wrapSilent, ErrorSeverity, handleError } from '../errorHandler.js';

/**
 * Get a view element by its data-view-id attribute
 * @param {string} viewId - The view ID to search for
 * @returns {HTMLElement|null} The element with matching viewId or null
 */
export function getViewElById(viewId) {
  return document.querySelector(`[data-view-id="${viewId}"]`);
}

/**
 * Walk the Golden Layout tree and find all items of a given type
 * GoldenLayout doesn't have getItemsByType, so we implement it here
 */
function getItemsByType(item, type) {
  const results = [];

  if (!item) return results;

  if (item.type === type) {
    results.push(item);
  }

  // Recursively search content array
  if (Array.isArray(item.content)) {
    item.content.forEach(child => {
      results.push(...getItemsByType(child, type));
    });
  }

  // Also check if item itself has the needed structure
  // Some Golden Layout versions nest items differently
  if (item.children && Array.isArray(item.children)) {
    item.children.forEach(child => {
      results.push(...getItemsByType(child, type));
    });
  }

  return results;
}

/**
 * Focus a specific dock view by switching to it
 * Tries multiple approaches to activate the view:
 * 1. Find containing stack and activate item within it
 * 2. Walk up parent hierarchy using dock API
 * 3. DOM fallback - click the corresponding GoldenLayout tab
 *
 * @param {string} viewId - The view ID to focus ('sidebar', 'chat', 'settings', 'memories', 'trash')
 * @param {Object} dock - The dock layout instance
 */
export function focusDockView(viewId, dock) {
  return wrapLogged(() => {
    if (!dock) {
      console.debug('[dock] No dock instance available');
      return;
    }

    const gl = dock?.gl;
    if (!gl) {
      console.debug('[dock] No GoldenLayout instance found');
      return;
    }

    // Try different ways to access the root
    let root = gl?.root;
    if (!root && gl?.contentItem) {
      root = gl.contentItem;
    }

    if (!root) {
      console.debug('[dock] No root item found in GoldenLayout');
      return;
    }

    const items = getItemsByType(root, 'component');
    const matches = items.filter((it) => it?.config?.componentState?.viewId === viewId);

    // If tree walking didn't find items, we'll try DOM fallback below
    // so don't return early here

    const debug = !!window.__ccDebugDockFocus;
    const dbg = (...args) => {
      if (!debug) return;
      wrapLogged(() => {
        console.debug('[dock] focusDockView', ...args);
      }, 'dock focus debug logging');
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

      // Try scrollIntoView
      wrapLogged(() => {
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }, 'scroll tab into view');

      // Try pointer events
      wrapLogged(() => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
      }, 'dispatch pointer events to tab');

      // Try mouse events
      wrapLogged(() => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, 'dispatch mouse events to tab');

      // Try direct click
      wrapLogged(() => {
        el.click?.();
      }, 'call click() on tab');

      return true;
    };

    // Preferred path: find the containing stack and activate the component within it.
    const tryStackActivation = () => {
      const stacks = getItemsByType(root, 'stack');
      for (const it of matches) {
        const stack = stacks.find((s) => Array.isArray(s?.content) && s.content.includes(it));
        if (!stack) continue;

        dbg('found stack', { viewId, stackId: stack?.id, title: it?.config?.title });

        // Try various stack activation methods
        if (wrapLogged(() => {
          if (typeof stack.setActiveContentItem === 'function') {
            stack.setActiveContentItem(it);
            return true;
          }
        }, 'stack.setActiveContentItem')) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof stack.setActiveComponentItem === 'function') {
            stack.setActiveComponentItem(it);
            return true;
          }
        }, 'stack.setActiveComponentItem')) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof stack.setActiveItem === 'function') {
            stack.setActiveItem(it);
            return true;
          }
        }, 'stack.setActiveItem')) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof stack.setActiveItemIndex === 'function' && Array.isArray(stack.content)) {
            const idx = stack.content.indexOf(it);
            if (idx >= 0) {
              stack.setActiveItemIndex(idx);
              return true;
            }
          }
        }, 'stack.setActiveItemIndex')) {
          return true;
        }
      }

      dbg('no containing stack found (or no stack activation API worked)', { viewId, matches: matches.length });
      return false;
    };

    if (tryStackActivation()) return;

    // Fallback: walk up parent hierarchy using dock API
    const activateViaApi = (item) => {
      let p = item?.parent;
      let depth = 0;
      const maxDepth = 20; // Prevent infinite loops

      while (p && depth < maxDepth) {
        depth++;

        // Try various parent activation methods
        if (wrapLogged(() => {
          if (typeof p.setActiveContentItem === 'function') {
            p.setActiveContentItem(item);
            return true;
          }
        }, `parent.setActiveContentItem (depth ${depth})`)) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof p.setActiveComponentItem === 'function') {
            p.setActiveComponentItem(item);
            return true;
          }
        }, `parent.setActiveComponentItem (depth ${depth})`)) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof p.setActiveItem === 'function') {
            p.setActiveItem(item);
            return true;
          }
        }, `parent.setActiveItem (depth ${depth})`)) {
          return true;
        }

        if (wrapLogged(() => {
          if (typeof p.setActiveItemIndex === 'function' && Array.isArray(p.content)) {
            const idx = p.content.indexOf(item);
            if (idx >= 0) {
              p.setActiveItemIndex(idx);
              return true;
            }
          }
        }, `parent.setActiveItemIndex (depth ${depth})`)) {
          return true;
        }

        p = p.parent;
      }

      return false;
    };

    for (const it of matches) {
      if (activateViaApi(it)) return;
    }

    // DOM fallback: click the corresponding GoldenLayout tab
    wrapLogged(() => {
      console.debug('[dock] Trying DOM fallback for viewId:', viewId);
      const rootEl = document.getElementById('dock-root');
      if (!rootEl) {
        console.debug('[dock] No dock-root element found');
        return false;
      }

      const wantedTitle = titleForViewId(viewId);
      const wanted = wantedTitle.toLowerCase();

      const tabEls = Array.from(rootEl?.querySelectorAll?.('.lm_tab') || []);
      const titleEls = Array.from(rootEl?.querySelectorAll?.('.lm_tab .lm_title') || []);
      const actualTexts = tabEls.map(t => t.textContent?.trim()).filter(Boolean);
      console.debug('[dock] Found tabs:', tabEls.length, 'Found titles:', titleEls.length, 'Looking for:', wanted);
      console.debug('[dock] Actual tab texts:', actualTexts.join(', '));

      // Try both exact match and case-insensitive match
      let tabByText = tabEls.find((t) => (t?.textContent || '').toString().trim().toLowerCase() === wanted);

      // If no exact match, try matching against any tab
      if (!tabByText && actualTexts.length > 0) {
        console.debug('[dock] No exact match found. Trying fuzzy match against:', actualTexts);
        // For "chat" view, also try matching "Chat" or partial matches
        tabByText = tabEls.find((t) => {
          const text = (t?.textContent || '').toString().trim().toLowerCase();
          return text === wanted || text.includes(wanted) || wanted.includes(text);
        });
      }

      if (tabByText) {
        console.debug('[dock] Found tab by text match:', tabByText.textContent?.trim());
        dbg('dom fallback tab(.lm_tab)', { found: true, title: wantedTitle, viewId });
        if (dispatchTabActivate(tabByText)) return true;
      }

      const titleEl = titleEls.find((t) => (t?.textContent || '').toString().trim().toLowerCase() === wanted);
      const tabFromTitle = titleEl?.closest?.('.lm_tab') || titleEl;
      dbg('dom fallback tab(.lm_title)', { found: !!tabFromTitle, title: wantedTitle, viewId });
      if (dispatchTabActivate(tabFromTitle)) return true;

      dbg('all activation methods failed', { viewId, wantedTitle });
      return false;
    }, 'dock DOM fallback activation');
  }, `focus dock view: ${viewId}`);
}

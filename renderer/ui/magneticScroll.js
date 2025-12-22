/**
 * Magnetic scroll controller - keeps viewport pinned to bottom while reading
 * When user is engaged at bottom, small scroll up impulses are ignored
 * Large scrolls or drags release the magnet
 */

import { wrapLogged, ErrorSeverity, handleError } from '../errorHandler.js';

export function createMagneticScrollController({ els, state }) {
  let engaged = false;
  let upImpulse = 0;
  let impulseTimer = null;
  let raf = null;
  let observer = null;

  const nearBottomPx = 90;
  const releaseDistancePx = 260;
  const releaseImpulsePx = 160;

  const hasActiveSelectionInMessages = () => {
    try {
      const host = els.messagesEl;
      if (!host) return false;
      const sel = window.getSelection?.();
      if (!sel) return false;
      if (sel.type !== 'Range') return false;
      if (sel.rangeCount <= 0) return false;
      const range = sel.getRangeAt(0);
      const node = range?.commonAncestorContainer;
      if (!node) return false;
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return false;
      return host.contains(el);
    } catch {
      return false;
    }
  };

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
    if (hasActiveSelectionInMessages()) return;
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = null;
      wrapLogged(() => {
        el.scrollTop = el.scrollHeight;
      }, 'scroll messages to bottom');
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
    if (hasActiveSelectionInMessages()) {
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

    wrapLogged(() => {
      el.addEventListener('scroll', onScroll, { passive: true });
    }, 'attach scroll listener');

    wrapLogged(() => {
      el.addEventListener('wheel', onWheel, { passive: true });
    }, 'attach wheel listener');

    wrapLogged(() => {
      observer = new MutationObserver(() => {
        if (!state.magneticScroll) return;
        if (!engaged) return;
        if (!state.isStreaming) return;
        if (hasActiveSelectionInMessages()) return;
        scrollToBottom();
      });
      observer.observe(el, { subtree: true, childList: true, characterData: true });
    }, 'attach mutation observer for magnetic scroll');
  };

  const detach = () => {
    const el = els.messagesEl;
    if (el) {
      wrapLogged(() => {
        el.removeEventListener('scroll', onScroll);
        el.removeEventListener('wheel', onWheel);
      }, 'remove scroll/wheel listeners');
    }

    wrapLogged(() => {
      observer?.disconnect?.();
      observer = null;
    }, 'disconnect mutation observer');

    if (raf) {
      try {
        window.cancelAnimationFrame(raf);
      } catch {
        // Ignore if RAF already fired
      }
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

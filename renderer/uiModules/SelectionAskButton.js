/**
 * SelectionAskButton - Text selection feature
 * Shows a button when text is selected in assistant messages
 * Allows attaching selection text to the prompt
 */

export class SelectionAskButton {
  constructor({ els, state, fileAttachmentHandler, signal }) {
    this.els = els;
    this.state = state;
    this.fileAttachmentHandler = fileAttachmentHandler;
    this.signal = signal;
    this.btn = null;
    this.raf = null;

    this.attachListeners();
  }

  hide() {
    if (!this.btn) return;
    this.btn.classList.add('hidden');
    this.btn.removeAttribute('data-selection-text');
  }

  ensureBtn() {
    if (this.btn) return this.btn;
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'selection-ask-btn hidden';
    this.btn.textContent = 'Ask Crystal Chat';
    this.btn.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        const text = (this.btn?.getAttribute('data-selection-text') || '').toString();
        if (!text) return;

        const cap = 200000;
        const clipped = text.length > cap ? `${text.slice(0, cap)}\n\n[...truncated...]` : text;
        this.state.pendingTextFile = {
          name: 'Selection.txt',
          type: 'text/plain',
          size: clipped.length,
          text: clipped
        };
        this.fileAttachmentHandler.renderCallback();
        this.hide();
        try {
          this.els.promptInput?.focus();
        } catch {
          // ignore
        }
      },
      { signal: this.signal }
    );

    document.body.appendChild(this.btn);
    this.signal.addEventListener(
      'abort',
      () => {
        try {
          this.btn?.remove();
        } catch {
          // ignore
        }
        this.btn = null;
      },
      { once: true }
    );

    return this.btn;
  }

  getSelectionState() {
    try {
      const sel = window.getSelection?.();
      if (!sel) return null;
      if (sel.type !== 'Range') return null;
      if (sel.rangeCount <= 0) return null;
      const range = sel.getRangeAt(0);
      const rawText = (sel.toString?.() || '').toString();
      const text = rawText.trim();
      if (!text) return null;

      const node = range?.commonAncestorContainer;
      const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      if (!el) return null;

      const assistantContent = el.closest?.('.message.assistant .message-content');
      if (!assistantContent) return null;

      const rect = range.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
      if (rect.width <= 0 && rect.height <= 0) return null;

      return { text, rect };
    } catch {
      return null;
    }
  }

  positionBtn({ rect }) {
    const b = this.ensureBtn();
    const pad = 8;
    const margin = 8;

    const wasHidden = b.classList.contains('hidden');
    if (wasHidden) {
      b.classList.remove('hidden');
      b.style.visibility = 'hidden';
    }

    const viewportLeft = window.scrollX;
    const viewportTop = window.scrollY;
    const viewportRight = window.scrollX + window.innerWidth;
    const viewportBottom = window.scrollY + window.innerHeight;

    const selectionLeft = rect.left + window.scrollX;
    const selectionRight = rect.right + window.scrollX;
    const selectionTop = rect.top + window.scrollY;

    const btnRect = b.getBoundingClientRect();
    const bw = Math.max(1, Math.round(btnRect.width || b.offsetWidth || 1));
    const bh = Math.max(1, Math.round(btnRect.height || b.offsetHeight || 1));

    const xRight = Math.round(selectionRight + pad);
    const xLeft = Math.round(selectionLeft - pad - bw);

    let x;
    if (xRight + bw <= viewportRight - margin) {
      x = xRight;
    } else if (xLeft >= viewportLeft + margin) {
      x = xLeft;
    } else {
      x = Math.min(Math.max(xRight, viewportLeft + margin), viewportRight - margin - bw);
    }

    const yPreferred = Math.round(selectionTop - 6);
    const y = Math.min(Math.max(yPreferred, viewportTop + margin), viewportBottom - margin - bh);

    b.style.left = `${x}px`;
    b.style.top = `${y}px`;

    if (wasHidden) {
      b.style.visibility = '';
      b.classList.add('hidden');
    }
  }

  update() {
    if (this.raf) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = null;
      const s = this.getSelectionState();
      if (!s) {
        this.hide();
        return;
      }
      const b = this.ensureBtn();
      b.setAttribute('data-selection-text', s.text);
      this.positionBtn(s);
      b.classList.remove('hidden');
    });
  }

  onDocMouseDown(e) {
    const t = e?.target;
    if (!t || !(t instanceof Element)) return;
    if (t.closest?.('.selection-ask-btn')) return;
    this.hide();
  }

  attachListeners() {
    document.addEventListener('selectionchange', () => this.update(), { signal: this.signal });
    document.addEventListener('mouseup', () => this.update(), { signal: this.signal });
    document.addEventListener('keyup', () => this.update(), { signal: this.signal });
    window.addEventListener('blur', () => this.hide(), { signal: this.signal, capture: true });
    window.addEventListener('scroll', () => this.hide(), { signal: this.signal, capture: true });
    document.addEventListener('mousedown', (e) => this.onDocMouseDown(e), { signal: this.signal, capture: true });
  }
}

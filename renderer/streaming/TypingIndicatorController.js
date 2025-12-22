/**
 * Typing indicator spinner animation controller
 * Manages requestAnimationFrame-based rotation animation and visibility
 */

export class TypingIndicatorController {
  constructor(typingIndicatorEl) {
    this.el = typingIndicatorEl;
    this.spinnerEl = null;
    this.spinnerRafId = null;
    this.spinnerLastTs = 0;
    this.spinnerAngle = 0;

    if (this.el) {
      try {
        this.spinnerEl = this.el.querySelector('.spinner');
      } catch {
        // ignore
      }
    }
  }

  /**
   * Start the typing indicator spinner animation
   * Uses requestAnimationFrame for smooth 360° rotation
   */
  show() {
    if (this.spinnerRafId) return;
    if (!this.spinnerEl || !this.el) return;

    this.spinnerLastTs = 0;

    const step = (ts) => {
      // Stop if indicator hidden or removed from DOM
      if (!this.el || this.el.classList.contains('hidden')) {
        this._cleanup();
        return;
      }

      if (!this.spinnerLastTs) this.spinnerLastTs = ts;
      const dt = ts - this.spinnerLastTs;
      this.spinnerLastTs = ts;

      // Rotate 360° over 800ms
      this.spinnerAngle = (this.spinnerAngle + (dt / 800) * 360) % 360;
      this.spinnerEl.style.transform = `rotate(${this.spinnerAngle}deg)`;
      this.spinnerRafId = window.requestAnimationFrame(step);
    };

    this.spinnerRafId = window.requestAnimationFrame(step);
  }

  /**
   * Stop the typing indicator spinner animation and hide element
   */
  hide() {
    if (this.el) {
      try {
        this.el.classList.add('hidden');
      } catch {
        // ignore
      }
    }
    this._cleanup();
  }

  /**
   * Update typing indicator label text
   * @param {string} text - Label text to display
   */
  setLabel(text) {
    if (!this.el) return;

    const labelEl = this.el.querySelector('[data-label-el]');
    if (labelEl) {
      try {
        labelEl.textContent = (text || '').toString();
        return;
      } catch {
        // ignore
      }
    }

    // Fallback: try to find text node
    try {
      const nodes = Array.from(this.el.childNodes || []);
      const textNode = nodes.find((n) => n && n.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = ` ${String(text || '')}`;
        return;
      }
    } catch {
      // ignore
    }

    // Last resort: use data attribute
    try {
      this.el.dataset.ccLabel = (text || '').toString();
    } catch {
      // ignore
    }
  }

  /**
   * Clean up RAF and reset animation state
   * @private
   */
  _cleanup() {
    if (this.spinnerRafId) {
      window.cancelAnimationFrame(this.spinnerRafId);
      this.spinnerRafId = null;
    }
    this.spinnerLastTs = 0;
    this.spinnerAngle = 0;
    if (this.spinnerEl) {
      try {
        this.spinnerEl.style.transform = '';
      } catch {
        // ignore
      }
    }
  }

  /**
   * Destroy controller and clean up resources
   */
  destroy() {
    this._cleanup();
    this.el = null;
    this.spinnerEl = null;
  }
}

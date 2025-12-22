/**
 * PopoverManager - Shared popover behavior
 * Handles hover-based popover open/close with delay
 * Can be reused for multiple popovers in the application
 */

export class PopoverManager {
  constructor({ btn, popover, open, close, signal }) {
    this.btn = btn;
    this.popover = popover;
    this.open = open;
    this.close = close;
    this.signal = signal;
    this.closeTimer = null;

    this.attachListeners();
  }

  clearCloseTimer() {
    if (!this.closeTimer) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  scheduleClose() {
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.close();
    }, 150);
  }

  attachListeners() {
    // Button hover
    this.btn?.addEventListener('mouseenter', () => {
      this.clearCloseTimer();
      this.open();
    });
    this.btn?.addEventListener('mouseleave', () => {
      this.scheduleClose();
    });

    // Popover hover
    this.popover?.addEventListener('mouseenter', () => {
      this.clearCloseTimer();
      this.open();
    });
    this.popover?.addEventListener('mouseleave', () => {
      this.scheduleClose();
    });
  }
}

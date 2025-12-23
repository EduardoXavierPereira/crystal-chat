/**
 * KeyboardShortcutsUI - Settings panel for keyboard shortcuts
 * Handles rendering and recording new keybindings
 */

export class KeyboardShortcutsUI {
  constructor({ els, controller, signal }) {
    this.els = els;
    this.controller = controller;
    this.signal = signal;
    this.recordingShortcutId = null;
    this.recordingKeyIndex = null;

    this.attachListeners();
    this.render();
  }

  /**
   * Render shortcuts list
   */
  render() {
    const container = this.els.keyboardShortcutsListEl;
    if (!container) return;

    const shortcuts = this.controller.getEffectiveShortcuts();
    container.innerHTML = '';

    for (const [id, shortcut] of Object.entries(shortcuts)) {
      const item = this.createShortcutItem({ id, ...shortcut });
      container.appendChild(item);
    }
  }

  /**
   * Create shortcut item element
   */
  createShortcutItem(shortcut) {
    const item = document.createElement('div');
    item.className = 'keyboard-shortcut-item';

    const info = document.createElement('div');
    info.className = 'keyboard-shortcut-info';

    const label = document.createElement('div');
    label.className = 'keyboard-shortcut-label';
    label.textContent = shortcut.label;

    const description = document.createElement('div');
    description.className = 'keyboard-shortcut-description';
    description.textContent = shortcut.description;

    info.appendChild(label);
    info.appendChild(description);

    const keysContainer = document.createElement('div');
    keysContainer.className = 'keyboard-shortcut-keys';

    shortcut.keys.forEach((key, index) => {
      const keyEl = document.createElement('button');
      keyEl.className = 'keyboard-shortcut-key';
      keyEl.textContent = this.formatKeyDisplay(key);
      keyEl.dataset.shortcutId = shortcut.id;
      keyEl.dataset.keyIndex = index;
      keyEl.title = 'Click to rebind';
      keyEl.type = 'button';
      keysContainer.appendChild(keyEl);
    });

    item.appendChild(info);
    item.appendChild(keysContainer);

    return item;
  }

  /**
   * Format key for display (platform-specific symbols)
   */
  formatKeyDisplay(key) {
    const platform = this.controller.platform;
    let formatted = key;

    if (platform === 'mac') {
      formatted = formatted
        .replace(/Mod/g, '⌘')
        .replace(/Cmd/g, '⌘')
        .replace(/Ctrl/g, '⌃')
        .replace(/Alt/g, '⌥')
        .replace(/Shift/g, '⇧');
    } else {
      formatted = formatted.replace(/Mod/g, 'Ctrl');
    }

    return formatted;
  }

  /**
   * Start recording new keybinding
   */
  startRecording(shortcutId, keyIndex) {
    this.stopRecording();

    this.recordingShortcutId = shortcutId;
    this.recordingKeyIndex = keyIndex;

    const keyEl = document.querySelector(
      `.keyboard-shortcut-key[data-shortcut-id="${shortcutId}"][data-key-index="${keyIndex}"]`
    );
    if (keyEl) {
      keyEl.classList.add('recording');
      keyEl.textContent = 'Press keys...';
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    document.querySelectorAll('.keyboard-shortcut-key.recording').forEach((el) => {
      el.classList.remove('recording');
    });

    this.recordingShortcutId = null;
    this.recordingKeyIndex = null;
  }

  /**
   * Handle recorded keypress
   */
  handleRecordedKey(event) {
    if (!this.recordingShortcutId) return;

    event.preventDefault();
    event.stopPropagation();

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

    const keyStr = this.controller.eventToKeyString(event);
    if (!keyStr) return;

    try {
      const shortcuts = this.controller.getEffectiveShortcuts();
      const shortcut = shortcuts[this.recordingShortcutId];
      const newKeys = [...shortcut.keys];
      newKeys[this.recordingKeyIndex] = keyStr;

      this.controller.setShortcutKeys(this.recordingShortcutId, newKeys);

      this.stopRecording();
      this.render();
    } catch (err) {
      alert(err.message);
      this.stopRecording();
      this.render();
    }
  }

  /**
   * Attach event listeners
   */
  attachListeners() {
    document.addEventListener(
      'click',
      (e) => {
        const keyEl = e.target?.closest?.('.keyboard-shortcut-key');
        if (!keyEl) {
          if (this.recordingShortcutId) {
            this.stopRecording();
            this.render();
          }
          return;
        }

        const shortcutId = keyEl.dataset.shortcutId;
        const keyIndex = parseInt(keyEl.dataset.keyIndex, 10);

        if (shortcutId && !isNaN(keyIndex)) {
          this.startRecording(shortcutId, keyIndex);
        }
      },
      { signal: this.signal }
    );

    document.addEventListener(
      'keydown',
      (e) => this.handleRecordedKey(e),
      { signal: this.signal, capture: true }
    );

    this.els.resetShortcutsBtn?.addEventListener(
      'click',
      () => {
        if (confirm('Reset all keyboard shortcuts to defaults?')) {
          this.controller.resetAllShortcuts();
          this.render();
        }
      },
      { signal: this.signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.recordingShortcutId) {
          this.stopRecording();
          this.render();
        }
      },
      { signal: this.signal }
    );
  }
}

/**
 * KeyboardShortcutsController - Centralized keyboard shortcut management
 * Handles detection, execution, and conflict checking
 */

import { DEFAULT_SHORTCUTS } from '../config/defaultKeyboardShortcuts.js';

export class KeyboardShortcutsController {
  constructor({ els, state, saveUIState, signal, callbacks }) {
    this.els = els;
    this.state = state;
    this.saveUIState = saveUIState;
    this.signal = signal;
    this.callbacks = callbacks; // { focusDockView, abortStreaming }

    this.platform = this.detectPlatform();
    this.attachListeners();
  }

  /**
   * Detect platform for Mod key resolution
   */
  detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('win')) return 'windows';
    return 'linux';
  }

  /**
   * Get effective shortcuts (user customizations + defaults)
   */
  getEffectiveShortcuts() {
    const custom = this.state.keyboardShortcuts || {};
    const result = {};

    for (const [id, config] of Object.entries(DEFAULT_SHORTCUTS)) {
      result[id] = {
        ...config,
        keys: custom[id] || config.defaultKeys
      };
    }

    return result;
  }

  /**
   * Convert keyboard event to normalized string (e.g., "Ctrl+Shift+H")
   */
  eventToKeyString(event) {
    const parts = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Cmd');

    const key = event.key;
    if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      if (key === ',') parts.push(',');
      else if (key === '/') parts.push('/');
      else if (key.length === 1) parts.push(key.toUpperCase());
      else parts.push(key);
    }

    return parts.join('+');
  }

  /**
   * Replace Mod with platform-specific modifier
   */
  normalizeKeyString(keyStr) {
    const mod = this.platform === 'mac' ? 'Cmd' : 'Ctrl';
    return keyStr.replace(/Mod/g, mod);
  }

  /**
   * Check if target is an input field
   */
  isInputTarget(target) {
    if (!target) return false;
    const tagName = target.tagName?.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      target.contentEditable === 'true'
    );
  }

  /**
   * Check if shortcut should be enabled based on app state
   */
  isShortcutEnabled(shortcut) {
    if (!shortcut.enabledWhen) return true;

    if (shortcut.enabledWhen === 'isStreaming') {
      return !!this.state.isStreaming;
    }

    return true;
  }

  /**
   * Execute shortcut action
   */
  executeAction(action) {
    const [type, target] = action.split(':');

    switch (type) {
      case 'focus':
        if (target === 'promptInput') {
          this.els.promptInput?.focus();
        } else if (target === 'home') {
          // Special case: home screen requires setting pendingNew and navigating to chat
          this.callbacks.goToHome?.();
        } else {
          // focus:chat, focus:memories, focus:trash, focus:settings, focus:sidebar
          this.callbacks.focusDockView?.(target);
        }
        break;

      case 'streaming':
        if (target === 'abort') {
          this.callbacks.abortStreaming?.();
        }
        break;

      default:
        console.warn(`Unknown shortcut action: ${action}`);
    }
  }

  /**
   * Main keyboard event handler
   */
  handleKeyDown(event) {
    const eventKeyStr = this.eventToKeyString(event);
    const hasModifiers = event.ctrlKey || event.altKey || event.metaKey;

    // Input field guard logic
    if (this.isInputTarget(event.target)) {
      // Allow Ctrl/Cmd shortcuts even in inputs (common UX pattern)
      if (!event.ctrlKey && !event.metaKey) {
        // Check if this plain key is a registered shortcut (e.g., "/")
        const shortcuts = this.getEffectiveShortcuts();
        const isRegisteredPlainKey = Object.values(shortcuts).some((s) =>
          s.keys.some((k) => this.normalizeKeyString(k) === eventKeyStr)
        );

        if (!isRegisteredPlainKey) return; // Let normal typing happen
      }
    }

    // Find matching shortcut
    const shortcuts = this.getEffectiveShortcuts();

    for (const shortcut of Object.values(shortcuts)) {
      if (!this.isShortcutEnabled(shortcut)) continue;

      for (const keyBinding of shortcut.keys) {
        const normalized = this.normalizeKeyString(keyBinding);

        if (normalized === eventKeyStr) {
          event.preventDefault();
          event.stopPropagation();
          this.executeAction(shortcut.action);
          return;
        }
      }
    }
  }

  /**
   * Attach global keyboard listener
   */
  attachListeners() {
    document.addEventListener(
      'keydown',
      (e) => this.handleKeyDown(e),
      { signal: this.signal, capture: true }
    );
  }

  /**
   * Update custom keybinding
   */
  setShortcutKeys(shortcutId, keys) {
    if (!this.state.keyboardShortcuts) {
      this.state.keyboardShortcuts = {};
    }

    const conflicts = this.findConflicts(shortcutId, keys);
    if (conflicts.length > 0) {
      throw new Error(`Key binding conflicts with: ${conflicts.join(', ')}`);
    }

    this.state.keyboardShortcuts[shortcutId] = keys;
    this.saveUIState(this.state);
  }

  /**
   * Reset shortcut to default
   */
  resetShortcut(shortcutId) {
    if (!this.state.keyboardShortcuts) return;
    delete this.state.keyboardShortcuts[shortcutId];
    this.saveUIState(this.state);
  }

  /**
   * Reset all shortcuts
   */
  resetAllShortcuts() {
    this.state.keyboardShortcuts = null;
    this.saveUIState(this.state);
  }

  /**
   * Find conflicting shortcuts
   */
  findConflicts(excludeId, keys) {
    const shortcuts = this.getEffectiveShortcuts();
    const conflicts = [];

    for (const [id, shortcut] of Object.entries(shortcuts)) {
      if (id === excludeId) continue;

      for (const key of keys) {
        const normalized = this.normalizeKeyString(key);

        for (const existingKey of shortcut.keys) {
          if (this.normalizeKeyString(existingKey) === normalized) {
            conflicts.push(shortcut.label);
            break;
          }
        }
      }
    }

    return conflicts;
  }
}

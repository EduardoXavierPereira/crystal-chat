/**
 * PromptInputController - Manages prompt input field interactions
 * Handles input events, file attachments via paste/drop, and keyboard shortcuts
 */

import { saveDraft } from '../utils/draftManager.js';

export class PromptInputController {
  constructor({
    els,
    state,
    fileAttachmentHandler,
    autosizePrompt,
    updateSendButtonEnabled,
    handleSubmit,
    abortStreaming,
    signal
  }) {
    this.els = els;
    this.state = state;
    this.fileAttachmentHandler = fileAttachmentHandler;
    this.autosizePrompt = autosizePrompt;
    this.updateSendButtonEnabled = updateSendButtonEnabled;
    this.handleSubmit = handleSubmit;
    this.abortStreaming = abortStreaming;
    this.signal = signal;

    this.draftSaveTimeout = null;

    this.attachListeners();
  }

  attachListeners() {
    // Input and autosize
    this.els.promptInput.addEventListener('input', () => {
      this.autosizePrompt(this.els.promptInput);
      this.updateSendButtonEnabled();
      this.scheduleDraftSave();
    });

    // Send button while streaming
    this.els.sendBtn?.addEventListener('click', (e) => {
      if (!this.state.isStreaming) return;
      e.preventDefault();
      e.stopPropagation();
      this.abortStreaming?.();
    });

    // Form submit
    this.els.promptForm.addEventListener('submit', this.handleSubmit);

    // Enter to send (Shift+Enter for newline)
    this.els.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit(e);
      }
    });

    // Paste events (files, images, text)
    this.els.promptInput.addEventListener('paste', (e) => this.handlePaste(e), { signal: this.signal });

    // Drag and drop
    this.attachDragDropListeners();

    // Save draft immediately on page unload (before debounce completes)
    window.addEventListener('beforeunload', () => {
      this.saveDraftImmediately();
      this.signal.dispatchEvent(new Event('abort'));
    });
  }

  async handlePaste(e) {
    const dt = e?.clipboardData;
    if (!dt) return;
    let handled = false;

    const hasDirectFiles = Array.from(dt.files || []).length > 0;
    const hasFileItems = Array.from(dt.items || []).some((it) => it && it.kind === 'file');
    const types = Array.from(dt.types || []).map((t) => (t || '').toString().toLowerCase());
    const hasUriListType = types.includes('text/uri-list');

    // Prevent default paste if it looks like file content
    if (hasDirectFiles || hasFileItems || hasUriListType) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Try direct files first (best case)
    const directFiles = Array.from(dt.files || []);
    for (const f of directFiles) {
      if (handled) break;
      handled = await this.fileAttachmentHandler.classifyAndAttachFile(f);
    }

    // Try clipboard items (some platforms)
    if (!handled) {
      const items = Array.from(dt.items || []);
      for (const it of items) {
        if (handled) break;
        if (it.kind !== 'file') continue;
        const f = it.getAsFile?.();
        if (!f) continue;
        handled = await this.fileAttachmentHandler.classifyAndAttachFile(f);
      }
    }

    // Try file URIs/paths from text (Linux file managers)
    if (!handled) {
      const uriList = (dt.getData?.('text/uri-list') || '').toString();
      const plain = (dt.getData?.('text/plain') || '').toString();
      const pick = (uriList || plain || '').trim();
      const firstLine = pick.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));

      if (firstLine && window.electronAPI?.readLocalFile) {
        try {
          const res = await window.electronAPI.readLocalFile(firstLine);
          handled = this.processElectronFileResult(res);
        } catch {
          // ignore
        }
      }
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  processElectronFileResult(res) {
    if (res && res.ok && res.kind === 'image' && res.base64) {
      if (!Array.isArray(this.state.pendingImages)) this.state.pendingImages = [];
      this.state.pendingImages = [
        ...this.state.pendingImages,
        {
          base64: res.base64,
          name: res.name,
          type: res.type,
          previewUrl: `data:${(res.type || 'image/*').toString()};base64,${res.base64}`
        }
      ];
      this.fileAttachmentHandler.renderCallback();
      return true;
    } else if (res && res.ok && res.kind === 'text' && typeof res.text === 'string') {
      this.state.pendingTextFile = {
        name: res.name,
        type: res.type,
        size: typeof res.size === 'number' ? res.size : 0,
        text: res.text
      };
      this.fileAttachmentHandler.renderCallback();
      return true;
    }
    return false;
  }

  attachDragDropListeners() {
    const onDragOver = (e) => {
      try {
        if (!e) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      } catch {
        // ignore
      }
    };

    const onDrop = async (e) => {
      const files = Array.from(e?.dataTransfer?.files || []);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();

      for (const f of files) {
        await this.fileAttachmentHandler.classifyAndAttachFile(f);
      }
    };

    this.els.promptForm?.addEventListener('dragover', onDragOver, { signal: this.signal });
    this.els.promptForm?.addEventListener('drop', onDrop, { signal: this.signal });
    window.addEventListener('dragover', onDragOver, { signal: this.signal });
    window.addEventListener('drop', onDrop, { signal: this.signal });
  }

  scheduleDraftSave() {
    // Clear existing timeout
    if (this.draftSaveTimeout) clearTimeout(this.draftSaveTimeout);

    // Schedule save with debounce (500ms) to avoid excessive localStorage writes
    this.draftSaveTimeout = setTimeout(() => {
      this.saveDraftImmediately();
    }, 500);
  }

  saveDraftImmediately() {
    saveDraft(this.els.promptInput.value);
  }
}

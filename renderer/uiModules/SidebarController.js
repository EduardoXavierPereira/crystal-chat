/**
 * SidebarController - Manages trash and memories sidebar sections
 * Handles sidebar selection, search, memory/trash operations
 */

export class SidebarController {
  constructor({
    els,
    state,
    applySidebarSelection,
    focusDockView,
    onMemoriesSearchInput,
    onMemoriesAdd,
    onMemoriesOpen,
    onMemoriesExport,
    onMemoriesImport,
    onMemoriesImportFile,
    onMemoriesImportComplete,
    onTrashSearchInput,
    onTrashRestoreAll,
    onTrashDeleteAll,
    onTrashOpen,
    signal
  }) {
    this.els = els;
    this.state = state;
    this.applySidebarSelection = applySidebarSelection;
    this.focusDockView = focusDockView;
    this.onMemoriesSearchInput = onMemoriesSearchInput;
    this.onMemoriesAdd = onMemoriesAdd;
    this.onMemoriesOpen = onMemoriesOpen;
    this.onMemoriesExport = onMemoriesExport;
    this.onMemoriesImport = onMemoriesImport;
    this.onMemoriesImportFile = onMemoriesImportFile;
    this.onMemoriesImportComplete = onMemoriesImportComplete;
    this.onTrashSearchInput = onTrashSearchInput;
    this.onTrashRestoreAll = onTrashRestoreAll;
    this.onTrashDeleteAll = onTrashDeleteAll;
    this.onTrashOpen = onTrashOpen;
    this.signal = signal;

    this.attachListeners();
  }

  closeImportConfirmation() {
    this.els.importConfirmationModalEl?.classList.add('hidden');
  }

  attachListeners() {
    // Trash button
    this.els.trashBtn?.addEventListener('click', () => {
      this.applySidebarSelection?.({ kind: 'trash' });
      this.focusDockView?.('trash');
      this.onTrashOpen?.();
      if (this.els.trashSearchInput) this.els.trashSearchInput.focus();
      this.els.trashBtn?.classList.add('active');
      this.els.memoriesBtn?.classList.remove('active');
    });

    // Memories button
    this.els.memoriesBtn?.addEventListener('click', () => {
      this.applySidebarSelection?.({ kind: 'memories' });
      this.focusDockView?.('memories');
      this.onMemoriesOpen?.();
      if (this.els.memoriesSearchInput) this.els.memoriesSearchInput.focus();
      this.els.memoriesBtn?.classList.add('active');
      this.els.trashBtn?.classList.remove('active');
    });

    // Search inputs
    this.els.trashSearchInput?.addEventListener('input', () => {
      this.state.trashQuery = (this.els.trashSearchInput.value || '').trim().toLowerCase();
      this.onTrashSearchInput?.();
    });

    this.els.memoriesSearchInput?.addEventListener('input', () => {
      this.state.memoriesQuery = (this.els.memoriesSearchInput.value || '').trim().toLowerCase();
      this.onMemoriesSearchInput?.();
    });

    // Add memory
    this.els.memoriesAddBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.runAddMemory();
    });

    this.els.memoriesAddInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.runAddMemory();
      }
    });

    // Trash operations
    this.els.trashRestoreAllBtn?.addEventListener('click', async () => {
      await this.onTrashRestoreAll?.();
    });

    this.els.trashDeleteAllBtn?.addEventListener('click', async () => {
      await this.onTrashDeleteAll?.();
    });

    // Export memories
    this.els.memoriesExportBtn?.addEventListener('click', async () => {
      await this.onMemoriesExport?.();
    });

    // Import memories
    this.els.memoriesImportBtn?.addEventListener('click', async () => {
      await this.onMemoriesImport?.();
    });

    // Handle file input change
    this.els.memoriesImportInput?.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      if (file) {
        await this.onMemoriesImportFile?.(file);
      }
    });

    // Import confirmation modal actions
    this.els.importConfirmationCancelBtn?.addEventListener('click', () => {
      this.closeImportConfirmation?.();
    });

    this.els.importConfirmationAddBtn?.addEventListener('click', async () => {
      this.closeImportConfirmation?.();
      await this.onMemoriesImportComplete?.('add');
    });

    this.els.importConfirmationOverrideBtn?.addEventListener('click', async () => {
      this.closeImportConfirmation?.();
      await this.onMemoriesImportComplete?.('override');
    });

    this.els.importConfirmationModalEl?.addEventListener('click', (e) => {
      if (e.target === this.els.importConfirmationModalEl) {
        this.closeImportConfirmation?.();
      }
    });

    // Custom events
    window.addEventListener(
      'cc:memoriesChanged',
      () => {
        const buttonActive = !!this.els.memoriesBtn?.classList?.contains?.('active');
        const selectionActive = this.state?.sidebarSelection?.kind === 'memories';
        const noButton = !this.els.memoriesBtn;
        if (noButton || buttonActive || selectionActive) this.onMemoriesOpen?.();
      },
      { signal: this.signal }
    );

    window.addEventListener(
      'cc:trashChanged',
      () => {
        const buttonActive = !!this.els.trashBtn?.classList?.contains?.('active');
        const selectionActive = this.state?.sidebarSelection?.kind === 'trash';
        const noButton = !this.els.trashBtn;
        if (noButton || buttonActive || selectionActive) this.onTrashOpen?.();
      },
      { signal: this.signal }
    );

    // Global open memories event
    window.addEventListener(
      'cc:openMemories',
      (e) => {
        const query = (e?.detail?.query || '').toString().trim();
        this.focusDockView?.('memories');
        this.onMemoriesOpen?.();
        if (this.els.memoriesSearchInput) {
          this.els.memoriesSearchInput.value = query;
          this.els.memoriesSearchInput.focus();
        }
        this.state.memoriesQuery = query.toLowerCase();
        this.onMemoriesSearchInput?.();
      },
      { signal: this.signal }
    );
  }

  async runAddMemory() {
    const v = (this.els.memoriesAddInput?.value || '').toString().trim();
    if (!v) return;
    this.els.memoriesAddInput.value = '';
    await this.onMemoriesAdd?.(v);
  }
}

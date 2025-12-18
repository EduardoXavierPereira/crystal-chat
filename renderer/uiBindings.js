export function attachUIBindings({
  els,
  state,
  tempChatId,
  autosizePrompt,
  clampNumber,
  saveUIState,
  closeConfirm,
  closePromptToolsPopover,
  togglePromptToolsPopover,
  closeChatHeaderToolsPopover,
  toggleChatHeaderToolsPopover,
  updateSendButtonEnabled,
  setRandomnessSliderFill,
  setTextSizeSliderFill,
  applyChatTextSize,
  renderChatsUI,
  handleSubmit,
  abortStreaming,
  applySidebarSelection,
  focusDockView,
  togglePinnedOpen,
  togglePinnedChat,
  onMemoriesSearchInput,
  onMemoriesAdd,
  onMemoriesOpen,
  onTrashSearchInput,
  onTrashRestoreAll,
  onTrashDeleteAll,
  onTrashOpen
}) {
  const bindingsAbort = new AbortController();

  const prefersDarkMql = (() => {
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)') || null;
    } catch {
      return null;
    }
  })();

  const resolveTheme = () => {
    const raw = (state?.theme || 'system').toString();
    if (raw === 'dark' || raw === 'light') return raw;
    if (raw !== 'system') return 'dark';
    return prefersDarkMql?.matches ? 'dark' : 'light';
  };

  const extractPdfText = async (file) => {
    try {
      if (!file) return '';
      const name = (file.name || '').toString().toLowerCase();
      const type = (file.type || '').toString().toLowerCase();
      if (type !== 'application/pdf' && !name.endsWith('.pdf')) return '';

      const pdfjs = await import(new URL('../node_modules/pdfjs-dist/build/pdf.mjs', import.meta.url).toString());
      try {
        if (pdfjs?.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        }
      } catch {
        // ignore
      }

      const buf = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
      const doc = await loadingTask.promise;

      const maxPages = 25;
      const maxChars = 200000;
      const pageCount = Math.min(doc.numPages || 0, maxPages);

      const parts = [];
      let used = 0;
      for (let i = 1; i <= pageCount; i += 1) {
        if (used >= maxChars) break;
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const pageText = (tc?.items || [])
          .map((it) => (it && typeof it.str === 'string' ? it.str : ''))
          .filter((s) => s)
          .join(' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (!pageText) continue;
        parts.push(pageText);
        used += pageText.length + 2;
      }

      const raw = parts.join('\n\n');
      if (!raw) return '';
      return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[...truncated...]` : raw;
    } catch {
      return '';
    }
  };

  const attachBinaryFile = async (file) => {
    try {
      if (!file) return false;
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(new Error('file_read_failed'));
        fr.onload = () => resolve(String(fr.result || ''));
        fr.readAsDataURL(file);
      });
      state.pendingFile = {
        dataUrl,
        name: file.name,
        type: file.type,
        size: typeof file.size === 'number' ? file.size : 0
      };
      renderPromptAttachments();
      return true;
    } catch {
      return false;
    }
  };

  const applyThemeAndAccent = () => {
    try {
      document.documentElement.dataset.theme = resolveTheme();
    } catch {
      // ignore
    }
    try {
      document.documentElement.style.setProperty('--accent', (state?.accent || '#7fc9ff').toString());
    } catch {
      // ignore
    }
  };

  const updateThemeSegmentUI = () => {
    const theme = (state?.theme || 'system').toString();
    els.themeSystemBtn?.classList.toggle('active', theme === 'system');
    els.themeDarkBtn?.classList.toggle('active', theme === 'dark');
    els.themeLightBtn?.classList.toggle('active', theme === 'light');
    els.themeSystemBtn?.setAttribute('aria-pressed', theme === 'system' ? 'true' : 'false');
    els.themeDarkBtn?.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    els.themeLightBtn?.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  };

  const updateAccentSwatchesUI = () => {
    const accent = (state?.accent || '#7fc9ff').toString().toLowerCase();
    const swatches = Array.from(els.accentSwatchesEl?.querySelectorAll?.('.accent-swatch') || []);
    swatches.forEach((btn) => {
      const v = (btn?.dataset?.accent || '').toString().toLowerCase();
      const isActive = v === accent;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  window.addEventListener(
    'cc:openMemories',
    (e) => {
      const query = (e?.detail?.query || '').toString().trim();
      focusDockView?.('memories');
      onMemoriesOpen?.();
      if (els.memoriesSearchInput) {
        els.memoriesSearchInput.value = query;
        els.memoriesSearchInput.focus();
      }
      state.memoriesQuery = query.toLowerCase();
      onMemoriesSearchInput?.();
    },
    { signal: bindingsAbort.signal }
  );

  function renderPromptAttachments() {
    const root = els.promptAttachmentsEl;
    if (!root) return;

    const textFile = state.pendingTextFile || null;
    const img = state.pendingImage || null;
    const file = state.pendingFile || null;
    const hasAny = !!(textFile || img || file);

    const isPdfText = !!textFile && (textFile.type || '').toString().toLowerCase() === 'application/pdf';
    const isPdfFile = !!file && (file.type || '').toString().toLowerCase() === 'application/pdf';

    root.innerHTML = '';
    root.classList.toggle('hidden', !hasAny);
    els.promptInsertBtn?.classList.toggle('has-attachment', !!img);

    if (textFile) {
      const wrap = document.createElement('div');
      wrap.className = 'prompt-attachment';

      const title = document.createElement('div');
      title.className = 'prompt-attachment-title';
      const isPdfText = (textFile.type || '').toString().toLowerCase() === 'application/pdf';
      title.textContent = `${isPdfText ? 'PDF' : 'Text'}: ${textFile.name || 'file'}`;

      const meta = document.createElement('div');
      meta.className = 'prompt-attachment-meta';
      if (typeof textFile.size === 'number' && textFile.size > 0) {
        meta.textContent = textFile.size < 1024
          ? `${textFile.size} B`
          : `${Math.max(1, Math.ceil(textFile.size / 1024))} KB`;
      } else {
        meta.textContent = '';
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'prompt-attachment-remove';
      remove.setAttribute('aria-label', 'Remove text file');
      remove.textContent = '×';
      remove.addEventListener(
        'click',
        () => {
          state.pendingTextFile = null;
          if (isPdfText) state.pendingFile = null;
          renderPromptAttachments();
        },
        { signal: bindingsAbort.signal }
      );

      wrap.appendChild(title);
      if (meta.textContent) wrap.appendChild(meta);
      wrap.appendChild(remove);
      root.appendChild(wrap);
    }

    if (img) {
      const wrap = document.createElement('div');
      wrap.className = 'prompt-attachment';

      const thumb = document.createElement('img');
      thumb.className = 'prompt-attachment-thumb';
      thumb.alt = 'Attached image';
      thumb.src = (img.previewUrl || '').toString();

      const title = document.createElement('div');
      title.className = 'prompt-attachment-title';
      title.textContent = `Image: ${img.name || 'image'}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'prompt-attachment-remove';
      remove.setAttribute('aria-label', 'Remove image');
      remove.textContent = '×';
      remove.addEventListener(
        'click',
        () => {
          state.pendingImage = null;
          renderPromptAttachments();
        },
        { signal: bindingsAbort.signal }
      );

      wrap.appendChild(thumb);
      wrap.appendChild(title);
      wrap.appendChild(remove);
      root.appendChild(wrap);
    }

    if (file && !isPdfText) {
      const wrap = document.createElement('div');
      wrap.className = 'prompt-attachment';

      const title = document.createElement('div');
      title.className = 'prompt-attachment-title';
      title.textContent = `File: ${file.name || 'file'}`;

      const meta = document.createElement('div');
      meta.className = 'prompt-attachment-meta';
      if (typeof file.size === 'number' && file.size > 0) {
        meta.textContent = file.size < 1024
          ? `${file.size} B`
          : `${Math.max(1, Math.ceil(file.size / 1024))} KB`;
      } else {
        meta.textContent = '';
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'prompt-attachment-remove';
      remove.setAttribute('aria-label', 'Remove file');
      remove.textContent = '×';
      remove.addEventListener(
        'click',
        () => {
          state.pendingFile = null;
          if (isPdfFile) state.pendingTextFile = null;
          renderPromptAttachments();
        },
        { signal: bindingsAbort.signal }
      );

      wrap.appendChild(title);
      if (meta.textContent) wrap.appendChild(meta);
      wrap.appendChild(remove);
      root.appendChild(wrap);
    }
  }

  renderPromptAttachments();

  const attachTextFile = async (file) => {
    try {
      if (!file) return false;
      const text = await file.text();
      const cap = 200000;
      const clipped = text.length > cap ? `${text.slice(0, cap)}\n\n[...truncated...]` : text;
      state.pendingTextFile = {
        name: file.name,
        type: file.type,
        size: typeof file.size === 'number' ? file.size : 0,
        text: clipped
      };
      renderPromptAttachments();
      return true;
    } catch {
      return false;
    }
  };

  const attachImageFile = async (file) => {
    try {
      if (!file) return false;
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(new Error('file_read_failed'));
        fr.onload = () => resolve(String(fr.result || ''));
        fr.readAsDataURL(file);
      });

      const idx = dataUrl.indexOf(',');
      const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
      state.pendingImage = { base64, name: file.name, type: file.type, previewUrl: dataUrl };
      renderPromptAttachments();
      return true;
    } catch {
      return false;
    }
  };

  const attachPdfFile = async (file) => {
    try {
      if (!file) return false;

      const ok = await attachBinaryFile(file);
      if (!ok) return false;

      const extracted = await extractPdfText(file);
      const text = extracted
        ? extracted
        : '[PDF text extraction failed. This PDF may be scanned (image-only) or the PDF parser could not load. Try OCR or a text-based PDF.]';
      state.pendingTextFile = {
        name: file.name,
        type: file.type,
        size: typeof file.size === 'number' ? file.size : 0,
        text
      };
      renderPromptAttachments();

      return true;
    } catch {
      return false;
    }
  };

  const classifyAndAttachFile = async (file) => {
    if (!file) return false;
    const type = (file.type || '').toString();
    const name = (file.name || '').toString().toLowerCase();
    const isImage = type.startsWith('image/');
    const isTextLike = type.startsWith('text/') || /\.(md|txt|json|csv|js|ts|py|html|css|yaml|yml)$/i.test(name);
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    if (isImage) return await attachImageFile(file);
    if (isTextLike) return await attachTextFile(file);
    if (isPdf) return await attachPdfFile(file);
    return await attachBinaryFile(file);
  };

  window.addEventListener(
    'cc:togglePinnedChat',
    async (e) => {
      const id = e?.detail?.id;
      if (typeof id !== 'string' || !id) return;
      if (id === tempChatId) return;
      await togglePinnedChat?.(id);
    },
    { signal: bindingsAbort.signal }
  );

  window.addEventListener('beforeunload', () => bindingsAbort.abort(), { signal: bindingsAbort.signal });

  if (prefersDarkMql?.addEventListener) {
    prefersDarkMql.addEventListener(
      'change',
      () => {
        if ((state?.theme || 'system').toString() !== 'system') return;
        applyThemeAndAccent();
      },
      { signal: bindingsAbort.signal }
    );
  } else if (prefersDarkMql?.addListener) {
    const handler = () => {
      if ((state?.theme || 'system').toString() !== 'system') return;
      applyThemeAndAccent();
    };
    prefersDarkMql.addListener(handler);
    bindingsAbort.signal.addEventListener(
      'abort',
      () => {
        try {
          prefersDarkMql.removeListener(handler);
        } catch {
          // ignore
        }
      },
      { once: true }
    );
  }

  els.promptForm.addEventListener('submit', handleSubmit);
  els.promptInput.addEventListener('input', () => {
    autosizePrompt(els.promptInput);
    updateSendButtonEnabled();
  });

  els.promptInput.addEventListener(
    'paste',
    async (e) => {
      const dt = e?.clipboardData;
      if (!dt) return;
      let handled = false;

      const hasDirectFiles = Array.from(dt.files || []).length > 0;
      const hasFileItems = Array.from(dt.items || []).some((it) => it && it.kind === 'file');
      const types = Array.from(dt.types || []).map((t) => (t || '').toString().toLowerCase());
      const hasUriListType = types.includes('text/uri-list');

      // Important: default paste happens immediately; if we wait for async work,
      // the file path text may already be inserted. Prevent synchronously when
      // clipboard looks like a file paste.
      if (hasDirectFiles || hasFileItems || hasUriListType) {
        e.preventDefault();
        e.stopPropagation();
      }

      // 1) Best case: browser/Electron provides actual files
      const directFiles = Array.from(dt.files || []);
      for (const f of directFiles) {
        if (handled) break;
        handled = await classifyAndAttachFile(f);
      }

      // 2) Some platforms expose file-like clipboard items
      if (!handled) {
        const items = Array.from(dt.items || []);
        for (const it of items) {
          if (handled) break;
          if (it.kind !== 'file') continue;
          const f = it.getAsFile?.();
          if (!f) continue;
          handled = await classifyAndAttachFile(f);
        }
      }

      // 3) Linux file managers commonly paste file URIs/paths as text.
      if (!handled) {
        const uriList = (dt.getData?.('text/uri-list') || '').toString();
        const plain = (dt.getData?.('text/plain') || '').toString();
        const pick = (uriList || plain || '').trim();
        const firstLine = pick.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));

        if (firstLine && window.electronAPI?.readLocalFile) {
          try {
            const res = await window.electronAPI.readLocalFile(firstLine);
            if (res && res.ok && res.kind === 'image' && res.base64) {
              state.pendingImage = {
                base64: res.base64,
                name: res.name,
                type: res.type,
                previewUrl: `data:${(res.type || 'image/*').toString()};base64,${res.base64}`
              };
              renderPromptAttachments();
              handled = true;
            } else if (res && res.ok && res.kind === 'text' && typeof res.text === 'string') {
              state.pendingTextFile = {
                name: res.name,
                type: res.type,
                size: typeof res.size === 'number' ? res.size : 0,
                text: res.text
              };
              renderPromptAttachments();
              handled = true;
            }
          } catch {
            // ignore
          }
        }
      }

      if (handled) {
        // default already prevented above for file-like pastes
        // (keep this block for safety if conditions change)
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { signal: bindingsAbort.signal }
  );

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
      const ok = await classifyAndAttachFile(f);
      if (ok) break;
    }
  };

  els.promptForm?.addEventListener('dragover', onDragOver, { signal: bindingsAbort.signal });
  els.promptForm?.addEventListener('drop', onDrop, { signal: bindingsAbort.signal });
  window.addEventListener('dragover', onDragOver, { signal: bindingsAbort.signal });
  window.addEventListener('drop', onDrop, { signal: bindingsAbort.signal });

  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  });

  els.sendBtn?.addEventListener('click', (e) => {
    if (!state.isStreaming) return;
    e.preventDefault();
    e.stopPropagation();
    abortStreaming?.();
  });

  const attachHoverPopover = ({ btn, popover, open, close }) => {
    let closeTimer = null;

    const clearCloseTimer = () => {
      if (!closeTimer) return;
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const scheduleClose = () => {
      clearCloseTimer();
      closeTimer = setTimeout(() => {
        close();
      }, 150);
    };

    btn?.addEventListener('mouseenter', () => {
      clearCloseTimer();
      open();
    });
    btn?.addEventListener('mouseleave', () => {
      scheduleClose();
    });

    popover?.addEventListener('mouseenter', () => {
      clearCloseTimer();
      open();
    });
    popover?.addEventListener('mouseleave', () => {
      scheduleClose();
    });
  };

  attachHoverPopover({
    btn: els.promptToolsBtn,
    popover: els.promptToolsPopover,
    open: () => {
      if (!els.promptToolsPopover || !els.promptToolsBtn) return;
      if (!els.promptToolsPopover.classList.contains('hidden')) return;
      togglePromptToolsPopover();
    },
    close: () => closePromptToolsPopover()
  });

  const closePromptInsertPopover = () => {
    if (!els.promptInsertPopover || !els.promptInsertBtn) return;
    els.promptInsertPopover.classList.add('hidden');
    els.promptInsertBtn.setAttribute('aria-expanded', 'false');
  };

  const togglePromptInsertPopover = () => {
    if (!els.promptInsertPopover || !els.promptInsertBtn) return;
    const isOpen = !els.promptInsertPopover.classList.contains('hidden');
    els.promptInsertPopover.classList.toggle('hidden', isOpen);
    els.promptInsertBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  };

  attachHoverPopover({
    btn: els.promptInsertBtn,
    popover: els.promptInsertPopover,
    open: () => {
      if (!els.promptInsertPopover || !els.promptInsertBtn) return;
      if (!els.promptInsertPopover.classList.contains('hidden')) return;
      togglePromptInsertPopover();
    },
    close: () => closePromptInsertPopover()
  });

  els.promptInsertBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { signal: bindingsAbort.signal }
  );

  els.promptInsertTextBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePromptInsertPopover();
      els.promptInsertTextInput?.click();
    },
    { signal: bindingsAbort.signal }
  );

  els.promptInsertImageBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePromptInsertPopover();
      els.promptInsertImageInput?.click();
    },
    { signal: bindingsAbort.signal }
  );

  els.promptInsertTextInput?.addEventListener(
    'change',
    async () => {
      const file = els.promptInsertTextInput?.files?.[0];
      try {
        if (!file) return;
        await classifyAndAttachFile(file);
      } catch {
        // ignore
      } finally {
        try {
          els.promptInsertTextInput.value = '';
        } catch {
          // ignore
        }
      }
    },
    { signal: bindingsAbort.signal }
  );

  els.promptInsertImageInput?.addEventListener(
    'change',
    async () => {
      const file = els.promptInsertImageInput?.files?.[0];
      try {
        if (!file) return;
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onerror = () => reject(new Error('file_read_failed'));
          fr.onload = () => resolve(String(fr.result || ''));
          fr.readAsDataURL(file);
        });

        const idx = dataUrl.indexOf(',');
        const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
        state.pendingImage = { base64, name: file.name, type: file.type, previewUrl: dataUrl };
        renderPromptAttachments();
      } catch {
        // ignore
      } finally {
        try {
          els.promptInsertImageInput.value = '';
        } catch {
          // ignore
        }
      }
    },
    { signal: bindingsAbort.signal }
  );

  attachHoverPopover({
    btn: els.chatHeaderToolsBtn,
    popover: els.chatHeaderToolsPopover,
    open: () => {
      if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
      if (!els.chatHeaderToolsPopover.classList.contains('hidden')) return;
      toggleChatHeaderToolsPopover?.();
    },
    close: () => closeChatHeaderToolsPopover?.()
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePromptToolsPopover();
      closePromptInsertPopover();
      closeChatHeaderToolsPopover?.();
    }
  });

  document.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (els.promptInsertBtn?.contains(t)) return;
      if (els.promptInsertPopover?.contains(t)) return;
      closePromptInsertPopover();
    },
    { signal: bindingsAbort.signal }
  );

  if (els.creativitySlider) {
    els.creativitySlider.addEventListener('input', () => {
      state.creativity = clampNumber(els.creativitySlider.value, 0, 2, 1);
      if (els.creativityValue) els.creativityValue.textContent = state.creativity.toFixed(2);
      setRandomnessSliderFill();
      saveUIState(state);
    });
  }

  if (els.textSizeSlider) {
    els.textSizeSlider.addEventListener('input', () => {
      state.textSize = clampNumber(els.textSizeSlider.value, 0.85, 1.25, 1);
      if (els.textSizeValue) els.textSizeValue.textContent = state.textSize.toFixed(2);
      setTextSizeSliderFill?.();
      applyChatTextSize?.();
      saveUIState(state);
    });
  }

  if (els.systemPromptInput) {
    els.systemPromptInput.addEventListener('input', () => {
      state.systemPrompt = (els.systemPromptInput.value || '').toString();
      saveUIState(state);
    });
  }

  els.chatSearchInput?.addEventListener('input', () => {
    state.chatQuery = (els.chatSearchInput.value || '').trim().toLowerCase();
    saveUIState(state);
    renderChatsUI();
  });

  els.newChatBtn.addEventListener('click', async () => {
    state.pendingNew = true;
    applySidebarSelection({ kind: 'chat', id: null });
    focusDockView?.('chat');
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    els.promptInput.focus();
  });

  const onThemeClick = (e) => {
    const btn = e?.currentTarget;
    const next = (btn?.dataset?.theme || '').toString();
    if (next !== 'system' && next !== 'dark' && next !== 'light') return;
    state.theme = next;
    applyThemeAndAccent();
    updateThemeSegmentUI();
    saveUIState(state);
  };

  els.themeSystemBtn?.addEventListener('click', onThemeClick, { signal: bindingsAbort.signal });
  els.themeDarkBtn?.addEventListener('click', onThemeClick, { signal: bindingsAbort.signal });
  els.themeLightBtn?.addEventListener('click', onThemeClick, { signal: bindingsAbort.signal });

  els.accentSwatchesEl?.addEventListener(
    'click',
    (e) => {
      const btn = e?.target?.closest?.('.accent-swatch');
      if (!btn || !els.accentSwatchesEl.contains(btn)) return;
      const next = (btn?.dataset?.accent || '').toString();
      if (!next) return;
      state.accent = next;
      applyThemeAndAccent();
      updateAccentSwatchesUI();
      saveUIState(state);
    },
    { signal: bindingsAbort.signal }
  );

  updateThemeSegmentUI();
  updateAccentSwatchesUI();

  els.trashBtn?.addEventListener('click', () => {
    applySidebarSelection?.({ kind: 'trash' });
    focusDockView?.('trash');
    onTrashOpen?.();
    if (els.trashSearchInput) els.trashSearchInput.focus();
    els.trashBtn?.classList.add('active');
    els.memoriesBtn?.classList.remove('active');
  });

  els.memoriesBtn?.addEventListener('click', () => {
    applySidebarSelection?.({ kind: 'memories' });
    focusDockView?.('memories');
    onMemoriesOpen?.();
    if (els.memoriesSearchInput) els.memoriesSearchInput.focus();
    els.memoriesBtn?.classList.add('active');
    els.trashBtn?.classList.remove('active');
  });

  window.addEventListener(
    'cc:memoriesChanged',
    () => {
      const buttonActive = !!els.memoriesBtn?.classList?.contains?.('active');
      const selectionActive = state?.sidebarSelection?.kind === 'memories';
      const noButton = !els.memoriesBtn;
      if (noButton || buttonActive || selectionActive) onMemoriesOpen?.();
    },
    { signal: bindingsAbort.signal }
  );

  window.addEventListener(
    'cc:trashChanged',
    () => {
      const buttonActive = !!els.trashBtn?.classList?.contains?.('active');
      const selectionActive = state?.sidebarSelection?.kind === 'trash';
      const noButton = !els.trashBtn;
      if (noButton || buttonActive || selectionActive) onTrashOpen?.();
    },
    { signal: bindingsAbort.signal }
  );

  els.pinnedBtn?.addEventListener('click', () => {
    togglePinnedOpen?.();
  });

  els.trashSearchInput?.addEventListener('input', () => {
    state.trashQuery = (els.trashSearchInput.value || '').trim().toLowerCase();
    onTrashSearchInput?.();
  });

  els.memoriesSearchInput?.addEventListener('input', () => {
    state.memoriesQuery = (els.memoriesSearchInput.value || '').trim().toLowerCase();
    onMemoriesSearchInput?.();
  });

  const runAddMemory = async () => {
    const v = (els.memoriesAddInput?.value || '').toString().trim();
    if (!v) return;
    els.memoriesAddInput.value = '';
    await onMemoriesAdd?.(v);
  };

  els.memoriesAddBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await runAddMemory();
  });

  els.memoriesAddInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await runAddMemory();
    }
  });

  els.trashRestoreAllBtn?.addEventListener('click', async () => {
    await onTrashRestoreAll?.();
  });

  els.trashDeleteAllBtn?.addEventListener('click', async () => {
    await onTrashDeleteAll?.();
  });

  els.confirmCancelBtn?.addEventListener('click', () => {
    closeConfirm(els, (v) => (state.confirmAction = v));
  });

  els.confirmOkBtn?.addEventListener('click', async () => {
    const action = state.confirmAction;
    closeConfirm(els, (v) => (state.confirmAction = v));
    if (typeof action === 'function') {
      await action();
    }
  });

  els.confirmModalEl?.addEventListener('click', (e) => {
    if (e.target === els.confirmModalEl) closeConfirm(els, (v) => (state.confirmAction = v));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.confirmModalEl && !els.confirmModalEl.classList.contains('hidden')) {
      closeConfirm(els, (v) => (state.confirmAction = v));
    }
  });
}

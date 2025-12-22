/**
 * FileAttachmentHandler - Manages file attachment operations
 * Handles file classification, PDF extraction, and attachment rendering
 */

export class FileAttachmentHandler {
  constructor({ state, renderCallback, signal }) {
    this.state = state;
    this.renderCallback = renderCallback;
    this.signal = signal;
  }

  async extractPdfText(file) {
    try {
      if (!file) return '';
      const name = (file.name || '').toString().toLowerCase();
      const type = (file.type || '').toString().toLowerCase();
      if (type !== 'application/pdf' && !name.endsWith('.pdf')) return '';

      const pdfjs = await import(new URL('../../node_modules/pdfjs-dist/build/pdf.mjs', import.meta.url).toString());
      try {
        if (pdfjs?.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
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
  }

  async attachBinaryFile(file) {
    try {
      if (!file) return false;
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(new Error('file_read_failed'));
        fr.onload = () => resolve(String(fr.result || ''));
        fr.readAsDataURL(file);
      });
      if (!Array.isArray(this.state.pendingFiles)) this.state.pendingFiles = [];
      this.state.pendingFiles = [
        ...this.state.pendingFiles,
        {
          dataUrl,
          name: file.name,
          type: file.type,
          size: typeof file.size === 'number' ? file.size : 0
        }
      ];
      this.renderCallback();
      return true;
    } catch {
      return false;
    }
  }

  async attachTextFile(file) {
    try {
      if (!file) return false;
      const text = await file.text();
      const cap = 200000;
      const clipped = text.length > cap ? `${text.slice(0, cap)}\n\n[...truncated...]` : text;
      this.state.pendingTextFile = {
        name: file.name,
        type: file.type,
        size: typeof file.size === 'number' ? file.size : 0,
        text: clipped
      };
      this.renderCallback();
      return true;
    } catch {
      return false;
    }
  }

  async attachImageFile(file) {
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
      if (!Array.isArray(this.state.pendingImages)) this.state.pendingImages = [];
      this.state.pendingImages = [...this.state.pendingImages, { base64, name: file.name, type: file.type, previewUrl: dataUrl }];
      this.renderCallback();
      return true;
    } catch {
      return false;
    }
  }

  async attachPdfFile(file) {
    try {
      if (!file) return false;

      const ok = await this.attachBinaryFile(file);
      if (!ok) return false;

      const extracted = await this.extractPdfText(file);
      const text = extracted
        ? extracted
        : '[PDF text extraction failed. This PDF may be scanned (image-only) or the PDF parser could not load. Try OCR or a text-based PDF.]';
      this.state.pendingTextFile = {
        name: file.name,
        type: file.type,
        size: typeof file.size === 'number' ? file.size : 0,
        text
      };
      this.renderCallback();

      return true;
    } catch {
      return false;
    }
  }

  async classifyAndAttachFile(file) {
    if (!file) return false;
    const type = (file.type || '').toString();
    const name = (file.name || '').toString().toLowerCase();
    const isImage = type.startsWith('image/');
    const isTextLike = type.startsWith('text/') || /\.(md|txt|json|csv|js|ts|py|html|css|yaml|yml)$/i.test(name);
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    if (isImage) return await this.attachImageFile(file);
    if (isTextLike) return await this.attachTextFile(file);
    if (isPdf) return await this.attachPdfFile(file);
    return await this.attachBinaryFile(file);
  }

  renderAttachments(els) {
    const root = els.promptAttachmentsEl;
    if (!root) return;

    const textFile = this.state.pendingTextFile || null;
    const images = Array.isArray(this.state.pendingImages) ? this.state.pendingImages : [];
    const files = Array.isArray(this.state.pendingFiles) ? this.state.pendingFiles : [];
    const hasAny = !!(textFile || images.length > 0 || files.length > 0);

    const isPdfText = !!textFile && (textFile.type || '').toString().toLowerCase() === 'application/pdf';

    root.innerHTML = '';
    root.classList.toggle('hidden', !hasAny);
    els.promptInsertBtn?.classList.toggle('has-attachment', images.length > 0);

    if (textFile) {
      const wrap = document.createElement('div');
      wrap.className = 'prompt-attachment';

      const title = document.createElement('div');
      title.className = 'prompt-attachment-title';
      const isPdfTextLocal = (textFile.type || '').toString().toLowerCase() === 'application/pdf';
      title.textContent = `${isPdfTextLocal ? 'PDF' : 'Text'}: ${textFile.name || 'file'}`;

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
          this.state.pendingTextFile = null;
          if (isPdfTextLocal && Array.isArray(this.state.pendingFiles)) {
            this.state.pendingFiles = this.state.pendingFiles.filter(
              (f) => (f?.type || '').toString().toLowerCase() !== 'application/pdf'
            );
          }
          this.renderAttachments(els);
        },
        { signal: this.signal }
      );

      wrap.appendChild(title);
      if (meta.textContent) wrap.appendChild(meta);
      wrap.appendChild(remove);
      root.appendChild(wrap);
    }

    images.forEach((img, idx) => {
      if (!img) return;
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
          this.state.pendingImages = images.filter((_, i) => i !== idx);
          this.renderAttachments(els);
        },
        { signal: this.signal }
      );

      wrap.appendChild(thumb);
      wrap.appendChild(title);
      wrap.appendChild(remove);
      root.appendChild(wrap);
    });

    files
      .filter((f) => f && (!isPdfText || (f.type || '').toString().toLowerCase() !== 'application/pdf'))
      .forEach((file, idx) => {
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
            this.state.pendingFiles = files.filter((_, i) => i !== idx);
            this.renderAttachments(els);
          },
          { signal: this.signal }
        );

        wrap.appendChild(title);
        if (meta.textContent) wrap.appendChild(meta);
        wrap.appendChild(remove);
        root.appendChild(wrap);
      });
  }
}

import { sanitizeAssistantHtml } from './sanitizeAssistantHtml.js';

export function updateRenderedMessage({ els, msg, messageIndex } = {}) {
  if (!els?.messagesEl) return false;
  if (!msg) return false;
  if (typeof messageIndex !== 'number') return false;

  const root = els.messagesEl.querySelector(`.message[data-message-index="${messageIndex}"]`);
  if (!root) return false;

  try {
    if (!window.__ccSelectionGuardsInstalled) {
      window.__ccSelectionGuardsInstalled = true;
      window.__ccMouseSelecting = false;
      window.__ccMouseSelectingMessageIndex = null;

      document.addEventListener('mousedown', (e) => {
        try {
          const target = e?.target;
          if (!target || !(target instanceof Element)) return;
          const msgEl = target.closest?.('.message[data-message-index]');
          if (!msgEl) return;
          window.__ccMouseSelecting = true;
          window.__ccMouseSelectingMessageIndex = msgEl.getAttribute('data-message-index');
        } catch {
          // ignore
        }
      }, true);

      const clear = () => {
        window.__ccMouseSelecting = false;
        window.__ccMouseSelectingMessageIndex = null;
      };
      document.addEventListener('mouseup', clear, true);
      document.addEventListener('dragend', clear, true);
      window.addEventListener('blur', clear, true);
    }
  } catch {
    // ignore
  }

  const hasSelectionWithin = (host) => {
    try {
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

  const freezeThisMessageDuringStream = !msg._done && (
    hasSelectionWithin(root)
    || (window.__ccMouseSelecting && String(window.__ccMouseSelectingMessageIndex) === String(messageIndex))
  );

  const markSectionSeen = (key) => {
    if (!msg) return;
    if (!msg._sectionSeenSeq || typeof msg._sectionSeenSeq !== 'object') msg._sectionSeenSeq = {};
    if (msg._sectionSeenSeq[key]) return;
    if (!window.__ccSectionSeq) window.__ccSectionSeq = 1;
    else window.__ccSectionSeq += 1;
    msg._sectionSeenSeq[key] = window.__ccSectionSeq;
  };

  const ensureSectionOrder = (key) => {
    if (!msg) return;
    if (!Array.isArray(msg._sectionOrder)) msg._sectionOrder = [];
    if (!msg._sectionOrder.includes(key)) msg._sectionOrder.push(key);
  };

  const syncSectionOrderFromSeen = () => {
    const seen = msg?._sectionSeenSeq;
    if (!seen || typeof seen !== 'object') return;
    const next = Object.entries(seen)
      .filter(([k, v]) => k && Number.isFinite(v))
      .sort((a, b) => a[1] - b[1])
      .map(([k]) => k);
    msg._sectionOrder = next;
  };

  const removeSectionOrder = (key) => {
    if (!Array.isArray(msg._sectionOrder)) return;
    msg._sectionOrder = msg._sectionOrder.filter((k) => k !== key);
  };

  const reorderSections = () => {
    const header = root.querySelector('.message-header');
    if (!header) return;

    const nodesByKey = {
      thinking: root.querySelector('.thinking'),
      memories: root.querySelector('.memories-retrieved')
    };

    syncSectionOrderFromSeen();
    const order = Array.isArray(msg._sectionOrder) && msg._sectionOrder.length
      ? msg._sectionOrder
      : [];

    let insertAfter = header;
    order.forEach((k) => {
      const n = nodesByKey[k];
      if (!n) return;
      if (insertAfter.nextSibling !== n) {
        root.insertBefore(n, insertAfter.nextSibling);
      }
      insertAfter = n;
    });
  };

  const contentEl = root.querySelector('.message-content');
  if (contentEl) {
    const shouldRenderMarkdown = msg.role === 'assistant' && window.marked && !freezeThisMessageDuringStream;
    if (shouldRenderMarkdown) {
      const now = Date.now();
      const last = Number.isFinite(msg._lastStreamMarkdownRenderTs) ? msg._lastStreamMarkdownRenderTs : 0;
      if (!msg._done && now - last < 150) return true;
      msg._lastStreamMarkdownRenderTs = now;
      contentEl.innerHTML = sanitizeAssistantHtml(window.marked.parse(msg.content || ''));
    } else {
      if (freezeThisMessageDuringStream) return true;
      const nextText = (msg.content || '').toString();
      let textNode = contentEl.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE || contentEl.childNodes.length !== 1) {
        while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
        textNode = document.createTextNode('');
        contentEl.appendChild(textNode);
      }
      textNode.nodeValue = nextText;
    }
  }

  const thinkingWrap = root.querySelector('.thinking');
  const shouldHaveThinking = msg.role === 'assistant' && (msg.thinking || msg._thinkingActive);

  const retrieved = msg.role === 'assistant' && Array.isArray(msg._retrievedMemories) ? msg._retrievedMemories : null;
  const shouldHaveRetrieved = !!retrieved && retrieved.length > 0;

  if (shouldHaveRetrieved) markSectionSeen('memories');
  if (shouldHaveThinking) markSectionSeen('thinking');

  if (freezeThisMessageDuringStream) return true;

  if (!shouldHaveThinking) {
    if (thinkingWrap) thinkingWrap.remove();
    removeSectionOrder('thinking');
  }

  let wrap = thinkingWrap;
  if (!wrap) {
    if (!shouldHaveThinking) wrap = null;
  }

  if (!wrap && shouldHaveThinking) {
    ensureSectionOrder('thinking');
    wrap = document.createElement('div');
    wrap.className = 'thinking';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'thinking-toggle';

    const toggleText = document.createElement('span');
    toggleText.className = 'thinking-toggle-text';
    toggleText.innerHTML =
      '<span class="thinking-toggle-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M10 16.584V18.9996C10 20.1042 10.8954 20.9996 12 20.9996C13.1046 20.9996 14 20.1042 14 18.9996L14 16.584M12 3V4M18.3643 5.63574L17.6572 6.34285M5.63574 5.63574L6.34285 6.34285M4 12H3M21 12H20M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9 7 12 7C14.7614 7 17 9.23858 17 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + `<span class="thinking-toggle-label">${msg._thinkingActive ? 'Thinking…' : 'Thinking'}</span>`;

    const chevron = document.createElement('span');
    chevron.className = 'thinking-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';

    const body = document.createElement('pre');
    body.className = 'thinking-body';
    body.textContent = msg.thinking || '';
    body.dataset.messageIndex = String(messageIndex);
    body.classList.toggle('hidden', !msg._thinkingOpen);
    const savedScrollTop = Number.isFinite(msg._thinkingScrollTop) ? msg._thinkingScrollTop : 0;
    body.scrollTop = Math.max(0, savedScrollTop);
    body.onscroll = () => {
      if (!msg._thinkingOpen) return;
      msg._thinkingScrollTop = body.scrollTop;
    };

    toggle.onclick = () => {
      msg._thinkingOpen = !msg._thinkingOpen;
      msg._thinkingUserToggled = true;
      body.classList.toggle('hidden', !msg._thinkingOpen);
      toggle.classList.toggle('open', !!msg._thinkingOpen);
    };

    toggle.classList.toggle('open', !!msg._thinkingOpen);
    toggle.appendChild(toggleText);
    toggle.appendChild(chevron);

    wrap.appendChild(toggle);
    wrap.appendChild(body);

    const anchor = root.querySelector('.message-content');
    if (anchor) root.insertBefore(wrap, anchor);
    else root.appendChild(wrap);

    reorderSections();
  }

  if (!wrap) {
    return true;
  }

  const toggle = wrap.querySelector('.thinking-toggle');
  const body = wrap.querySelector('.thinking-body');
  if (toggle) {
    toggle.classList.toggle('open', !!msg._thinkingOpen);
    const lbl = toggle.querySelector('.thinking-toggle-label');
    if (lbl) lbl.textContent = msg._thinkingActive ? 'Thinking…' : 'Thinking';
  }
  if (body) {
    if (!msg._done && hasSelectionWithin(body)) return true;
    const nextText = (msg.thinking || '').toString();
    let textNode = body.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || body.childNodes.length !== 1) {
      while (body.firstChild) body.removeChild(body.firstChild);
      textNode = document.createTextNode('');
      body.appendChild(textNode);
    }
    textNode.nodeValue = nextText;
    body.classList.toggle('hidden', !msg._thinkingOpen);
  }

  const memoriesWrap = root.querySelector('.memories-retrieved');

  if (!shouldHaveRetrieved) {
    if (memoriesWrap) memoriesWrap.remove();
    removeSectionOrder('memories');
    return true;
  }

  let mwrap = memoriesWrap;
  if (!mwrap) {
    ensureSectionOrder('memories');
    mwrap = document.createElement('div');
    mwrap.className = 'memories-retrieved';

    const mtoggle = document.createElement('button');
    mtoggle.type = 'button';
    mtoggle.className = 'thinking-toggle';

    const mtoggleText = document.createElement('span');
    mtoggleText.className = 'thinking-toggle-text';
    mtoggleText.innerHTML =
      '<span class="thinking-toggle-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M4 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M7 8h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M7 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M7 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="thinking-toggle-label">Memories retrieved</span>';

    const mchevron = document.createElement('span');
    mchevron.className = 'thinking-chevron';
    mchevron.setAttribute('aria-hidden', 'true');
    mchevron.textContent = '▸';

    const mbody = document.createElement('div');
    mbody.className = 'thinking-body';
    mbody.dataset.messageIndex = String(messageIndex);
    mbody.classList.toggle('hidden', !msg._retrievedMemoriesOpen);

    const savedScrollTop = Number.isFinite(msg._retrievedMemoriesScrollTop) ? msg._retrievedMemoriesScrollTop : 0;
    mbody.scrollTop = Math.max(0, savedScrollTop);
    mbody.onscroll = () => {
      if (!msg._retrievedMemoriesOpen) return;
      msg._retrievedMemoriesScrollTop = mbody.scrollTop;
    };

    mtoggle.onclick = () => {
      msg._retrievedMemoriesOpen = !msg._retrievedMemoriesOpen;
      mbody.classList.toggle('hidden', !msg._retrievedMemoriesOpen);
      mtoggle.classList.toggle('open', !!msg._retrievedMemoriesOpen);
    };

    mtoggle.classList.toggle('open', !!msg._retrievedMemoriesOpen);
    mtoggle.appendChild(mtoggleText);
    mtoggle.appendChild(mchevron);
    mwrap.appendChild(mtoggle);
    mwrap.appendChild(mbody);

    const anchor = root.querySelector('.message-content');
    if (anchor) root.insertBefore(mwrap, anchor);
    else root.appendChild(mwrap);

    reorderSections();
  }

  const mbody = mwrap.querySelector('.thinking-body');
  const mtoggle = mwrap.querySelector('.thinking-toggle');
  if (mtoggle) mtoggle.classList.toggle('open', !!msg._retrievedMemoriesOpen);
  if (mbody) {
    if (!msg._done && hasSelectionWithin(mbody)) return true;
    mbody.classList.toggle('hidden', !msg._retrievedMemoriesOpen);
    mbody.innerHTML = '';
    void import('./memories.js').then(({ getMemoryDisplayParts }) => {
      const items = Array.isArray(retrieved) ? retrieved : [];
      items.forEach((mem) => {
        const parts = getMemoryDisplayParts?.(mem) || { text: (mem?.text || '').toString(), meta: '' };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'memories-retrieved-item';
        const ts = parts.meta ? `${parts.meta} — ` : '';
        btn.textContent = `${ts}${(parts.text || '').toString()}`;
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ev = new CustomEvent('cc:openMemories', { detail: { query: (parts.text || '').toString() } });
          window.dispatchEvent(ev);
        };
        mbody.appendChild(btn);
      });
    });
  }

  if (!msg._done && hasSelectionWithin(root)) return true;

  return true;
}

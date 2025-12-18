import { applySuggestionToPrompt } from './newchat.js';
import { chatTitleFromMessages } from './sidebar.js';
import { createToggle } from './toggle.js';

 function sanitizeAssistantHtml(html) {
   const raw = (html || '').toString();
   if (!raw) return '';
 
   const allowedTags = new Set([
     'a',
     'b',
     'blockquote',
     'br',
     'code',
     'div',
     'em',
     'h1',
     'h2',
     'h3',
     'h4',
     'h5',
     'h6',
     'hr',
     'i',
     'li',
     'ol',
     'p',
     'pre',
     'span',
     'strong',
     'ul'
   ]);
 
   const allowedAttrsByTag = {
     a: new Set(['href', 'title', 'target', 'rel']),
     code: new Set(['class']),
     pre: new Set(['class']),
     span: new Set(['class']),
     div: new Set(['class'])
   };
 
   const safeUrl = (url) => {
     const s = (url || '').toString().trim();
     if (!s) return '';
     if (s.startsWith('#')) return s;
     let parsed;
     try {
       parsed = new URL(s, 'https://example.invalid');
     } catch {
       return '';
     }
     const proto = (parsed.protocol || '').toLowerCase();
     if (proto === 'http:' || proto === 'https:' || proto === 'mailto:') return s;
     return '';
   };
 
   const doc = new DOMParser().parseFromString(raw, 'text/html');
 
   const sanitizeNode = (node) => {
     if (!node) return;
     const kids = Array.from(node.childNodes || []);
     for (const child of kids) {
       if (child.nodeType === Node.ELEMENT_NODE) {
         const tag = (child.tagName || '').toLowerCase();
         if (!allowedTags.has(tag)) {
           child.replaceWith(document.createTextNode(child.textContent || ''));
           continue;
         }
 
         const allowedAttrs = allowedAttrsByTag[tag] || new Set();
         for (const attr of Array.from(child.attributes || [])) {
           const name = (attr.name || '').toLowerCase();
           if (name.startsWith('on')) {
             child.removeAttribute(attr.name);
             continue;
           }
           if (!allowedAttrs.has(name)) {
             child.removeAttribute(attr.name);
             continue;
           }
         }
 
         if (tag === 'a') {
           const href = safeUrl(child.getAttribute('href'));
           if (!href) {
             child.removeAttribute('href');
           } else {
             child.setAttribute('href', href);
             child.setAttribute('rel', 'noopener noreferrer');
             child.setAttribute('target', '_blank');
           }
         }
 
         sanitizeNode(child);
       } else if (child.nodeType === Node.COMMENT_NODE) {
         child.remove();
       }
     }
   };
 
   sanitizeNode(doc.body);
   return doc.body.innerHTML;
 }

export function updateRenderedMessage({ els, msg, messageIndex } = {}) {
  if (!els?.messagesEl) return false;
  if (!msg) return false;
  if (typeof messageIndex !== 'number') return false;

  const root = els.messagesEl.querySelector(`.message[data-message-index="${messageIndex}"]`);
  if (!root) return false;

  // During an active mouse drag, the Selection API may not yet reflect a stable Range,
  // but DOM updates can still corrupt the selection anchor. Track mousedown->mouseup.
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

  // If the user is selecting text while streaming, avoid DOM mutations inside this message.
  // Even "safe" updates (text node value changes, class toggles) can cause selection to jump/expand.
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

  // Update assistant content
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

  // Update thinking section
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
      + '<path d="M10 16.584V18.9996C10 20.1042 10.8954 20.9996 12 20.9996C13.1046 20.9996 14 20.1042 14 18.9996L14 16.584M12 3V4M18.3643 5.63574L17.6572 6.34285M5.63574 5.63574L6.34285 6.34285M4 12H3M21 12H20M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
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

    // Insert inline at the moment it first appears (right before content).
    // This preserves the natural order of appearance during streaming.
    const anchor = root.querySelector('.message-content');
    if (anchor) root.insertBefore(wrap, anchor);
    else root.appendChild(wrap);

    // Ensure visual order matches first-seen order.
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

    // Insert inline at the moment it first appears (right before content).
    const anchor = root.querySelector('.message-content');
    if (anchor) root.insertBefore(mwrap, anchor);
    else root.appendChild(mwrap);

    // Ensure visual order matches first-seen order.
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

function createCopyActionButton({ msg, messageIndex, onCopy } = {}) {
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'message-action';
  copyBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Copy</span>';
  copyBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy?.(msg, messageIndex);

    const textEl = copyBtn.querySelector('.message-action-text');
    if (!textEl) return;
    textEl.textContent = 'Copied!';
    if (copyBtn._copiedTimer) {
      window.clearTimeout(copyBtn._copiedTimer);
    }
    copyBtn._copiedTimer = window.setTimeout(() => {
      textEl.textContent = 'Copy';
      copyBtn._copiedTimer = null;
    }, 1000);
  };
  return copyBtn;
}

function createDeleteUserActionButton({ msg, messageIndex, onDeleteUserMessage } = {}) {
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'message-action danger';
  delBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Delete</span>';
  delBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteUserMessage?.(msg, messageIndex);
  };
  return delBtn;
}

function createEditUserActionButton({ msg, messageIndex, onBeginEditUserMessage } = {}) {
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'message-action';
  editBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Edit</span>';
  editBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onBeginEditUserMessage?.(messageIndex, msg);
  };
  return editBtn;
}

function computeUserMessageBranchChoices(chat, userMsgId) {
  const branches = Array.isArray(chat?.branches) ? chat.branches : [];
  const choices = [];
  for (const b of branches) {
    if (!b || !Array.isArray(b.messages)) continue;
    const found = b.messages.find((m) => m && m.role === 'user' && m.id === userMsgId);
    if (!found) continue;
    if (choices.some((c) => c.branchId === b.id)) continue;
    choices.push({ branchId: b.id, createdAt: b.createdAt || 0 });
  }
  choices.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return choices;
}

function createBranchNav({ chat, msg, onSwitchBranch } = {}) {
  if (!chat || !msg || msg.role !== 'user') return null;
  if (typeof msg.id !== 'string' || !msg.id) return null;
  const branches = Array.isArray(chat?.branches) ? chat.branches : [];
  if (branches.length <= 1) return null;

  const choices = computeUserMessageBranchChoices(chat, msg.id);
  if (choices.length <= 1) return null;

  const activeId = typeof chat.activeBranchId === 'string' ? chat.activeBranchId : null;
  let idx = choices.findIndex((c) => c.branchId === activeId);
  if (idx < 0) idx = 0;

  const wrap = document.createElement('div');
  wrap.className = 'message-branch-nav';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'message-branch-btn';
  prev.textContent = '<';
  prev.disabled = idx <= 0;
  prev.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (idx <= 0) return;
    const next = choices[idx - 1];
    if (!next) return;
    onSwitchBranch?.(next.branchId);
  };

  const label = document.createElement('div');
  label.className = 'message-branch-label';
  label.textContent = `${idx + 1}/${choices.length}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'message-branch-btn';
  next.textContent = '>';
  next.disabled = idx >= choices.length - 1;
  next.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (idx >= choices.length - 1) return;
    const n = choices[idx + 1];
    if (!n) return;
    onSwitchBranch?.(n.branchId);
  };

  wrap.appendChild(prev);
  wrap.appendChild(label);
  wrap.appendChild(next);
  return wrap;
}

export function renderMessageElement(
  msg,
  {
    onCopy,
    onRegenerate,
    onDeleteUserMessage,
    onBeginEditUserMessage,
    onCancelEditUserMessage,
    onApplyEditUserMessage,
    onSwitchBranch,
    messageIndex,
    chat,
    state
  } = {}
) {
  const div = document.createElement('div');
  div.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;
  if (typeof messageIndex === 'number') div.dataset.messageIndex = String(messageIndex);

  const header = document.createElement('div');
  header.className = 'message-header';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'message-header-icon';
  if (msg.role === 'user') {
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  } else {
    iconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 2v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="7" width="14" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="M9 12h.01M15 12h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 19v2M16 19v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  const label = document.createElement('span');
  label.className = 'message-header-label';
  label.textContent = msg.role === 'user' ? 'User' : 'Assistant';

  header.appendChild(iconWrap);
  header.appendChild(label);

  const content = document.createElement('div');
  content.className = 'message-content';

  const isEditingThis =
    msg.role === 'user'
    && state
    && typeof state.editingUserMessageIndex === 'number'
    && state.editingUserMessageIndex === messageIndex;

  if (isEditingThis) {
    const editor = document.createElement('div');
    editor.className = 'message-edit';

    const ta = document.createElement('textarea');
    ta.className = 'message-edit-input';
    ta.value = (state.editingUserMessageDraft || '').toString();
    ta.rows = 3;
    ta.oninput = () => {
      state.editingUserMessageDraft = (ta.value || '').toString();
    };

    const btns = document.createElement('div');
    btns.className = 'message-edit-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'message-action';
    cancel.textContent = 'Cancel';
    cancel.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onCancelEditUserMessage?.();
    };

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'message-action';
    apply.textContent = 'Apply';
    apply.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onApplyEditUserMessage?.(messageIndex, (ta.value || '').toString());
    };

    btns.appendChild(cancel);
    btns.appendChild(apply);

    editor.appendChild(ta);
    editor.appendChild(btns);
    content.appendChild(editor);
  } else if (msg.role === 'assistant' && window.marked) {
    content.innerHTML = sanitizeAssistantHtml(window.marked.parse(msg.content || ''));
  } else {
    content.textContent = msg.content;
  }

  div.appendChild(header);

  const reorderSections = () => {
    const headerEl = div.querySelector('.message-header');
    if (!headerEl) return;

    const nodesByKey = {
      thinking: div.querySelector('.thinking'),
      memories: div.querySelector('.memories-retrieved')
    };

    const order = Array.isArray(msg?._sectionOrder) && msg._sectionOrder.length
      ? msg._sectionOrder
      : ['thinking', 'memories'];

    let insertAfter = headerEl;
    order.forEach((k) => {
      const n = nodesByKey[k];
      if (!n) return;
      if (insertAfter.nextSibling !== n) {
        div.insertBefore(n, insertAfter.nextSibling);
      }
      insertAfter = n;
    });
  };

  if (msg.role === 'user') {
    const hasImages = Array.isArray(msg.images) && msg.images.length > 0;
    const hasTextFile = !!(msg.textFile && typeof msg.textFile === 'object');
    const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
    if (hasImages || hasTextFile || hasFiles) {
      const attach = document.createElement('div');
      attach.className = 'message-attachments';

      if (hasImages) {
        msg.images.forEach((img) => {
          const s = (img || '').toString();
          if (!s) return;
          const el = document.createElement('img');
          el.className = 'message-attachment-thumb';
          el.alt = 'Attached image';
          el.src = s.startsWith('data:') ? s : `data:image/*;base64,${s}`;
          el.loading = 'lazy';
          el.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              window.open(el.src);
            } catch {
              // ignore
            }
          };
          attach.appendChild(el);
        });
      }

      if (hasTextFile) {
        const chip = document.createElement('div');
        chip.className = 'message-attachment-file';
        const name = (msg.textFile?.name || 'file').toString();
        const size = typeof msg.textFile?.size === 'number' ? msg.textFile.size : 0;
        const sizeLabel = size > 0
          ? (size < 1024 ? `${size} B` : `${Math.max(1, Math.ceil(size / 1024))} KB`)
          : '';
        chip.textContent = sizeLabel ? `File: ${name} (${sizeLabel})` : `File: ${name}`;
        attach.appendChild(chip);
      }

      if (hasFiles) {
        msg.files.forEach((f) => {
          if (!f || typeof f !== 'object') return;
          const name = (f.name || 'file').toString();
          const type = (f.type || '').toString();
          const size = typeof f.size === 'number' ? f.size : 0;
          const sizeLabel = size > 0
            ? (size < 1024 ? `${size} B` : `${Math.max(1, Math.ceil(size / 1024))} KB`)
            : '';

          const href = (f.dataUrl || '').toString();
          const label = sizeLabel ? `File: ${name} (${sizeLabel})` : `File: ${name}`;

          if (href && href.startsWith('data:')) {
            const a = document.createElement('a');
            a.className = 'message-attachment-file';
            a.textContent = label;
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.download = name;
            a.title = type ? `${type}` : 'Download file';
            attach.appendChild(a);
          } else {
            const chip = document.createElement('div');
            chip.className = 'message-attachment-file';
            chip.textContent = label;
            attach.appendChild(chip);
          }
        });
      }

      div.appendChild(attach);
    }
  }

  if (msg.role === 'assistant' && Array.isArray(msg._retrievedMemories) && msg._retrievedMemories.length > 0) {
    if (!Array.isArray(msg._sectionOrder)) msg._sectionOrder = [];
    if (!msg._sectionOrder.includes('memories')) msg._sectionOrder.push('memories');
    const memWrap = document.createElement('div');
    memWrap.className = 'memories-retrieved';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'thinking-toggle';

    const toggleText = document.createElement('span');
    toggleText.className = 'thinking-toggle-text';
    toggleText.innerHTML =
      '<span class="thinking-toggle-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M4 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M7 8h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M7 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M7 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="thinking-toggle-label">Memories retrieved</span>';

    const chevron = document.createElement('span');
    chevron.className = 'thinking-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';

    const body = document.createElement('div');
    body.className = 'thinking-body';
    body.classList.toggle('hidden', !msg._retrievedMemoriesOpen);
    if (typeof messageIndex === 'number') body.dataset.messageIndex = String(messageIndex);

    const savedScrollTop = Number.isFinite(msg._retrievedMemoriesScrollTop) ? msg._retrievedMemoriesScrollTop : 0;
    body.scrollTop = Math.max(0, savedScrollTop);
    body.onscroll = () => {
      if (!msg._retrievedMemoriesOpen) return;
      msg._retrievedMemoriesScrollTop = body.scrollTop;
    };

    toggle.onclick = () => {
      msg._retrievedMemoriesOpen = !msg._retrievedMemoriesOpen;
      body.classList.toggle('hidden', !msg._retrievedMemoriesOpen);
      toggle.classList.toggle('open', !!msg._retrievedMemoriesOpen);
    };

    toggle.classList.toggle('open', !!msg._retrievedMemoriesOpen);
    toggle.appendChild(toggleText);
    toggle.appendChild(chevron);

    memWrap.appendChild(toggle);
    memWrap.appendChild(body);
    div.appendChild(memWrap);

    void import('./memories.js').then(({ getMemoryDisplayParts }) => {
      const items = Array.isArray(msg._retrievedMemories) ? msg._retrievedMemories : [];
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
        body.appendChild(btn);
      });
    });
  }

  if (msg.role === 'assistant' && (msg.thinking || msg._thinkingActive)) {
    if (!Array.isArray(msg._sectionOrder)) msg._sectionOrder = [];
    if (!msg._sectionOrder.includes('thinking')) msg._sectionOrder.push('thinking');
    const thinkingWrap = document.createElement('div');
    thinkingWrap.className = 'thinking';

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

    toggle.onclick = () => {
      msg._thinkingOpen = !msg._thinkingOpen;
      msg._thinkingUserToggled = true;
      body.classList.toggle('hidden', !msg._thinkingOpen);
      toggle.classList.toggle('open', !!msg._thinkingOpen);
    };

    toggle.classList.toggle('open', !!msg._thinkingOpen);
    toggle.appendChild(toggleText);
    toggle.appendChild(chevron);

    const body = document.createElement('pre');
    body.className = 'thinking-body';
    body.textContent = msg.thinking || '';
    body.classList.toggle('hidden', !msg._thinkingOpen);
    if (typeof messageIndex === 'number') body.dataset.messageIndex = String(messageIndex);

    const savedScrollTop = Number.isFinite(msg._thinkingScrollTop) ? msg._thinkingScrollTop : 0;
    body.scrollTop = Math.max(0, savedScrollTop);
    body.onscroll = () => {
      if (!msg._thinkingOpen) return;
      msg._thinkingScrollTop = body.scrollTop;
    };

    thinkingWrap.appendChild(toggle);
    thinkingWrap.appendChild(body);
    div.appendChild(thinkingWrap);
  }
  div.appendChild(content);

  reorderSections();

  if (msg.role === 'user') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    actions.appendChild(createCopyActionButton({ msg, messageIndex, onCopy }));
    actions.appendChild(createEditUserActionButton({ msg, messageIndex, onBeginEditUserMessage }));
    actions.appendChild(createDeleteUserActionButton({ msg, messageIndex, onDeleteUserMessage }));
    div.appendChild(actions);

    const nav = createBranchNav({ chat, msg, onSwitchBranch });
    if (nav) div.appendChild(nav);
  }

  if (msg.role === 'assistant' && msg._done !== false) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = createCopyActionButton({ msg, messageIndex, onCopy });

    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'message-action';
    regenBtn.innerHTML =
      '<span class="message-action-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083L3 16M3 12C3 7.02944 7.02944 3 12 3C14.3051 3 16.4077 3.86656 18 5.29168L21 8M3 21V16M3 16H8M21 3V8M21 8H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</span>'
      + '<span class="message-action-text">Regenerate</span>';
    regenBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRegenerate?.(msg, messageIndex);
    };

    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);
    div.appendChild(actions);
  }
  return div;
}

export function renderActiveChat({
  els,
  state,
  tempChatId,
  tempChat,
  typingIndicator,
  autosizePrompt,
  onSuggestion,
  onCopyMessage,
  onRegenerateMessage,
  onDeleteUserMessage,
  onBeginEditUserMessage,
  onCancelEditUserMessage,
  onApplyEditUserMessage,
  onSwitchBranch
}) {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  const chat = activeChatId === tempChatId ? tempChat : state.chats.find((c) => c.id === activeChatId);

  if (els.chatHeaderEl) els.chatHeaderEl.classList.remove('hidden');
  if (els.messagesEl) els.messagesEl.classList.remove('hidden');
  if (els.promptForm) els.promptForm.classList.remove('hidden');
  if (els.errorEl) els.errorEl.classList.toggle('hidden', els.errorEl.textContent === '');

  if (els.chatHeaderTitleEl) {
    els.chatHeaderTitleEl.textContent = chat ? chatTitleFromMessages(chat) : 'New chat';
  }

  if (els.chatHeaderTokensEl) {
    let totalChars = 0;
    if (chat?.messages) {
      for (const m of chat.messages) {
        if (!m) continue;
        const c = (m.content || '').toString();
        const th = (m.thinking || '').toString();
        totalChars += c.length + th.length;
      }
    }
    const estTokens = Math.max(0, Math.ceil(totalChars / 4));
    els.chatHeaderTokensEl.textContent = `${estTokens} tokens`;
  }

  let messagesScrollTop = 0;
  try {
    messagesScrollTop = els.messagesEl.scrollTop;
  } catch {
    messagesScrollTop = 0;
  }

  try {
    els.messagesEl.querySelectorAll('.thinking-body[data-message-index]').forEach((el) => {
      if (el.classList.contains('hidden')) return;
      const idx = el.dataset.messageIndex;
      if (!idx) return;
      const i = Number(idx);
      if (!Number.isFinite(i) || i < 0) return;
      const m = chat?.messages?.[i];
      if (!m) return;
      m._thinkingScrollTop = el.scrollTop;
    });
  } catch {
    // ignore
  }

  els.messagesEl.innerHTML = '';
  els.messagesEl.classList.toggle('empty', false);

  if (!chat) {
    const layout = document.createElement('div');
    layout.className = 'empty-layout';

    const main = document.createElement('div');
    main.className = 'empty-main';

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'What can I help with?';
    main.appendChild(empty);

    const suggestions = [
      'What can you do?',
      'What are your limitations?',
      'Teach me how to prompt AI.',
      'How do you work behind the scenes?'
    ];

    const chipWrap = document.createElement('div');
    chipWrap.className = 'suggestion-chips';
    suggestions.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-chip';
      btn.textContent = text;
      btn.onclick = () => {
        applySuggestionToPrompt({ promptInput: els.promptInput, autosizePrompt, text });
      };
      chipWrap.appendChild(btn);
    });

    const swap = document.createElement('div');
    swap.className = 'empty-swap';

    const explainer = document.createElement('div');
    explainer.className = 'temp-chat-explainer';
    explainer.textContent =
      'Temporary chats are not saved to history and won\'t appear in the sidebar. Memories are not saved.';

    swap.appendChild(chipWrap);
    swap.appendChild(explainer);

    const syncSwap = (enabled) => {
      if (enabled) {
        chipWrap.style.display = 'none';
        chipWrap.style.opacity = '0';
        explainer.style.display = 'block';
        explainer.style.opacity = '1';
      } else {
        explainer.style.display = 'none';
        explainer.style.opacity = '0';
        chipWrap.style.display = '';
        chipWrap.style.opacity = '1';
      }
    };

    let swapTimer = null;

    const animateSwap = (enabled) => {
      if (swapTimer) {
        window.clearTimeout(swapTimer);
        swapTimer = null;
      }
      if (enabled) {
        chipWrap.style.opacity = '0';
        swapTimer = window.setTimeout(() => {
          if (!state.temporaryChatEnabled) return;
          chipWrap.style.display = 'none';
          explainer.style.display = 'block';
          explainer.style.opacity = '0';
          requestAnimationFrame(() => {
            explainer.style.opacity = '1';
          });
          swapTimer = null;
        }, 170);
      } else {
        explainer.style.opacity = '0';
        swapTimer = window.setTimeout(() => {
          if (state.temporaryChatEnabled) return;
          explainer.style.display = 'none';
          chipWrap.style.display = '';
          chipWrap.style.opacity = '0';
          requestAnimationFrame(() => {
            chipWrap.style.opacity = '1';
          });
          swapTimer = null;
        }, 170);
      }
    };

    syncSwap(!!state.temporaryChatEnabled);

    main.appendChild(swap);
    layout.appendChild(main);

    const toggle = createToggle({
      id: 'temporary-chat-toggle',
      text: 'Temporary Chat',
      checked: !!state.temporaryChatEnabled,
      disabled: false,
      className: 'temp-chat-toggle',
      onChange: (v) => {
        state.temporaryChatEnabled = !!v;
        animateSwap(!!state.temporaryChatEnabled);
      }
    });
    layout.appendChild(toggle.el);

    els.messagesEl.appendChild(layout);
    els.messagesEl.appendChild(typingIndicator);
    els.messagesEl.classList.add('empty');
    return;
  }

  chat.messages.forEach((msg, messageIndex) => {
    els.messagesEl.appendChild(renderMessageElement(msg, {
      onCopy: onCopyMessage,
      onRegenerate: onRegenerateMessage,
      onDeleteUserMessage,
      onBeginEditUserMessage,
      onCancelEditUserMessage,
      onApplyEditUserMessage,
      onSwitchBranch,
      messageIndex,
      chat,
      state
    }));
  });
  els.messagesEl.appendChild(typingIndicator);

  // Restore scroll after layout to avoid it being clobbered while the element is still measuring.
  window.requestAnimationFrame(() => {
    try {
      els.messagesEl.querySelectorAll('.thinking-body[data-message-index]').forEach((el) => {
        if (el.classList.contains('hidden')) return;
        const idx = el.dataset.messageIndex;
        if (!idx) return;
        const i = Number(idx);
        if (!Number.isFinite(i) || i < 0) return;
        const m = chat?.messages?.[i];
        if (!m) return;
        const st = Number.isFinite(m._thinkingScrollTop) ? m._thinkingScrollTop : 0;
        el.scrollTop = Math.max(0, st);
      });
    } catch {
      // ignore
    }

    try {
      els.messagesEl.scrollTop = messagesScrollTop;
    } catch {
      // ignore
    }
  });
}

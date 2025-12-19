import { applySuggestionToPrompt } from './newchat.js';
import { chatTitleFromMessages } from './sidebar.js';
import { createToggle } from './toggle.js';
import { MODEL } from './state.js';
import { formatModelName } from './formatModelName.js';
import { createCustomDropdown } from './customDropdown.js';

const HOME_MODEL_OPTIONS = ['qwen3-vl:2b', 'qwen3-vl:4b', 'qwen3-vl:8b'];

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
  saveUIState,
  renderActiveChatUI,
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
    els.chatHeaderTitleEl.textContent = chat ? chatTitleFromMessages(chat) : 'Home Screen';
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
    layout.className = 'home-layout';

    const validWidgets = ['intro', 'suggestions', 'temp-toggle', 'recent-chats', 'model-selector', 'creativity'];
    let draggingId = null;
    let lastHoverId = null;
    let lastHoverAfter = false;

    const currentOrder = () => {
      const ordered = Array.isArray(state.homeWidgets) && state.homeWidgets.length > 0
        ? state.homeWidgets.filter((w) => validWidgets.includes(w))
        : [...validWidgets];
      // de-dupe while preserving order
      return ordered.filter((id, idx) => ordered.indexOf(id) === idx);
    };

    const reorderWidgets = (sourceId, targetId, placeAfter = false) => {
      if (!sourceId || !targetId || sourceId === targetId) {
        console.log('[home-widgets] reorder skipped', { sourceId, targetId, placeAfter });
        return;
      }
      const ordered = currentOrder();
      const sourceIndex = ordered.indexOf(sourceId);
      const withoutSource = ordered.filter((w) => w !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex === -1) {
        console.log('[home-widgets] reorder no target', { sourceId, targetId, ordered });
        return;
      }
      // If dropping on an item that is after the source, default to insert after to ensure movement.
      let effectiveAfter = placeAfter;
      if (sourceIndex > -1) {
        const targetOriginalIndex = ordered.indexOf(targetId);
        if (targetOriginalIndex > -1) {
          if (sourceIndex < targetOriginalIndex && !placeAfter) {
            effectiveAfter = true;
          } else if (sourceIndex > targetOriginalIndex && placeAfter) {
            effectiveAfter = false;
          }
        }
      }
      const insertAt = Math.min(
        withoutSource.length,
        Math.max(0, targetIndex + (effectiveAfter ? 1 : 0))
      );
      withoutSource.splice(insertAt, 0, sourceId);
      console.log('[home-widgets] reorder', {
        sourceId,
        targetId,
        placeAfter,
        effectiveAfter,
        before: ordered,
        after: withoutSource
      });
      state.homeWidgets = withoutSource;
      saveUIState(state);
      renderActiveChatUI();
    };

    const activeIds = currentOrder();

    const headerRow = document.createElement('div');
    headerRow.className = 'home-row';
    const title = document.createElement('div');
    title.className = 'home-title';
    title.textContent = 'Your home';
    const headerLeft = document.createElement('div');
    headerLeft.className = 'home-header-left';
    headerLeft.appendChild(title);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'home-edit-btn';
    editBtn.textContent = state.homeEditMode ? 'Done' : 'Edit';
    editBtn.onclick = () => {
      state.homeEditMode = !state.homeEditMode;
      saveUIState(state);
      renderActiveChatUI();
    };
    if (state.homeEditMode) {
      const addRow = document.createElement('div');
      addRow.className = 'home-add-row';
      const missing = ['intro', 'suggestions', 'temp-toggle', 'recent-chats', 'model-selector', 'creativity'].filter((id) => !activeIds.includes(id));
      addRow.textContent = missing.length === 0 ? 'All widgets added' : 'Add widgets:';
      missing.forEach((id) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'home-add-btn';
        const labelMap = {
          intro: 'What can I help you',
          suggestions: 'Suggestions',
          'temp-toggle': 'Temporary chat',
          'recent-chats': 'Recent chats',
          'model-selector': 'Model selector',
          creativity: 'Creativity slider'
        };
        btn.textContent = labelMap[id] || id;
        btn.onclick = () => {
          state.homeWidgets = [...activeIds, id];
          saveUIState(state);
          renderActiveChatUI();
        };
        addRow.appendChild(btn);
      });
      headerLeft.appendChild(addRow);
    }
    headerRow.appendChild(headerLeft);
    headerRow.appendChild(editBtn);

    const widgetList = document.createElement('div');
    widgetList.className = 'home-list';

    const renderWidget = (id) => {
      const card = document.createElement('div');
      card.className = 'home-widget';
      card.dataset.widgetId = id;
      if (state.homeEditMode) {
        card.classList.add('draggable');
        card.setAttribute('draggable', 'true');
      }

      const tools = document.createElement('div');
      tools.className = 'home-widget-tools';
      tools.classList.toggle('visible', !!state.homeEditMode);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'home-widget-tool danger';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => {
        state.homeWidgets = state.homeWidgets.filter((w) => w !== id);
        saveUIState(state);
        renderActiveChatUI();
      };

      tools.appendChild(removeBtn);
      card.appendChild(tools);

      const body = document.createElement('div');
      body.className = 'home-widget-body';

      if (id === 'intro') {
        card.classList.add('home-widget-intro');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'What can I help you with today?';
        body.appendChild(heading);
      } else if (id === 'suggestions') {
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Try one of these';
        const grid = document.createElement('div');
        grid.className = 'home-suggestions-grid';
        const suggestions = [
          'What can you do?',
          'What are your limitations?',
          'Teach me how to prompt AI.',
          'How do you work behind the scenes?'
        ];
        suggestions.forEach((text) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'home-suggestion';
          btn.textContent = text;
          btn.onclick = () => applySuggestionToPrompt({ promptInput: els.promptInput, autosizePrompt, text });
          grid.appendChild(btn);
        });
        body.appendChild(heading);
        body.appendChild(grid);
      } else if (id === 'temp-toggle') {
        card.classList.add('home-widget-temp');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Temporary chat';
        const desc = document.createElement('div');
        desc.className = 'home-widget-sub';
        desc.textContent = 'Not saved to history and memories stay off.';
        const row = document.createElement('div');
        row.className = 'home-temp-row';
        const textCol = document.createElement('div');
        textCol.className = 'home-temp-text';
        textCol.appendChild(heading);
        textCol.appendChild(desc);
        const toggle = createToggle({
          id: 'temporary-chat-toggle',
          text: 'Enable temporary chat',
          checked: !!state.temporaryChatEnabled,
          disabled: false,
          className: 'temp-chat-toggle',
          onChange: (v) => {
            state.temporaryChatEnabled = !!v;
            saveUIState(state);
          }
        });
        row.appendChild(textCol);
        row.appendChild(toggle.el);
        body.appendChild(row);
      } else if (id === 'recent-chats') {
        card.classList.add('home-widget-recent');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Recent chats';
        body.appendChild(heading);

        const list = document.createElement('div');
        list.className = 'home-recent-list';

        const sorted = [...(state.chats || [])]
          .map((c) => {
            const latestMsgTs = Array.isArray(c?.messages) && c.messages.length
              ? Math.max(...c.messages.map((m) => Number(m?.createdAt) || 0))
              : 0;
            const updatedAt = Math.max(Number(c?.updatedAt) || 0, Number(c?.createdAt) || 0, latestMsgTs);
            return { chat: c, updatedAt };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 5);

        if (!sorted.length) {
          const empty = document.createElement('div');
          empty.className = 'home-recent-empty';
          empty.textContent = 'No recent chats yet.';
          list.appendChild(empty);
        } else {
          sorted.forEach(({ chat: c, updatedAt }) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'home-recent-item';
            const title = document.createElement('div');
            title.className = 'home-recent-title';
            title.textContent = chatTitleFromMessages(c);
            const meta = document.createElement('div');
            meta.className = 'home-recent-meta';
            const ts = updatedAt ? new Date(updatedAt).toLocaleString() : '';
            meta.textContent = ts;
            item.appendChild(title);
            item.appendChild(meta);
            item.onclick = () => {
              state.sidebarSelection = { kind: 'chat', id: c.id };
              state.pendingNew = false;
              saveUIState(state);
              renderActiveChatUI();
            };
            list.appendChild(item);
          });
        }
        body.appendChild(list);
      } else if (id === 'model-selector') {
        card.classList.add('home-widget-model');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Model';
        const sub = document.createElement('div');
        sub.className = 'home-widget-sub';
        sub.textContent = `Current: ${formatModelName(state.selectedModel || MODEL)}`;
        const dropdownRoot = document.createElement('div');
        dropdownRoot.className = 'home-model-dropdown';
        let dropdown = null;
        const buildDropdown = () => {
          dropdownRoot.innerHTML = '';
          dropdown = createCustomDropdown({
            rootEl: dropdownRoot,
            options: HOME_MODEL_OPTIONS.map((m) => ({ value: m, label: formatModelName(m) })),
            value: state.selectedModel || MODEL,
            ariaLabel: 'Model',
            onChange: (next) => {
              const model = next || MODEL;
              state.selectedModel = model;
              saveUIState(state);
              sub.textContent = `Current: ${formatModelName(model)}`;
              try {
                window.dispatchEvent(new CustomEvent('cc:modelChanged', { detail: { model } }));
              } catch {
                // ignore
              }
            }
          });
        };
        buildDropdown();
        body.appendChild(heading);
        body.appendChild(sub);
        body.appendChild(dropdownRoot);
      } else if (id === 'creativity') {
        card.classList.add('home-widget-creativity');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Creativity';
        const sub = document.createElement('div');
        sub.className = 'home-widget-sub';
        sub.textContent = 'Adjust randomness globally.';
        const sliderRow = document.createElement('div');
        sliderRow.className = 'home-creativity-row';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '2';
        slider.step = '0.05';
        slider.value = String(state.creativity ?? 1);
        slider.className = 'home-creativity-slider';
        const value = document.createElement('div');
        value.className = 'home-creativity-value';
        value.textContent = Number(state.creativity ?? 1).toFixed(2);
        slider.oninput = () => {
          const v = Number(slider.value);
          const clamped = Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1;
          state.creativity = clamped;
          value.textContent = clamped.toFixed(2);
        };
        slider.onchange = () => {
          saveUIState(state);
          try {
            window.dispatchEvent(new CustomEvent('cc:creativityChanged', { detail: { creativity: state.creativity } }));
          } catch {
            // ignore
          }
        };
        sliderRow.appendChild(slider);
        sliderRow.appendChild(value);
        body.appendChild(heading);
        body.appendChild(sub);
        body.appendChild(sliderRow);
      } else {
        body.textContent = 'Unknown widget';
      }

      card.appendChild(body);

      if (state.homeEditMode) {
        card.addEventListener('dragstart', (e) => {
          draggingId = id;
          lastHoverId = null;
          lastHoverAfter = false;
          card.classList.add('dragging');
          console.log('[home-widgets] dragstart', { id });
          try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
          } catch {
            // ignore
          }
        });
        card.addEventListener('dragend', () => {
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          console.log('[home-widgets] dragend', { draggingId, lastHoverId, lastHoverAfter });
          // If drop never fired but we have a hover target, reorder as a fallback.
          if (draggingId && lastHoverId && lastHoverId !== draggingId) {
            reorderWidgets(draggingId, lastHoverId, !!lastHoverAfter);
          }
          draggingId = null;
          lastHoverId = null;
          lastHoverAfter = false;
          card.classList.remove('dragging');
          card.classList.remove('drag-over');
        });
        card.addEventListener('dragover', (e) => {
          if (!draggingId || draggingId === id) return;
          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = 'move';
          } catch {
            // ignore
          }
          const rect = card.getBoundingClientRect();
          const placeAfter = (e.clientY - rect.top) > rect.height / 2;
          lastHoverId = id;
          lastHoverAfter = placeAfter;
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          card.classList.add('drag-over');
          card.classList.toggle('drag-over-after', placeAfter);
          console.log('[home-widgets] dragover card', { draggingId, targetId: id, placeAfter });
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over', 'drag-over-after');
        });
        card.addEventListener('drop', (e) => {
          if (!draggingId || draggingId === id) return;
          e.preventDefault();
          const sourceId = draggingId;
          const rect = card.getBoundingClientRect();
          const placeAfter = (e.clientY - rect.top) > rect.height / 2;
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          draggingId = null;
          lastHoverId = null;
          lastHoverAfter = false;
          console.log('[home-widgets] drop on card', { sourceId, targetId: id, placeAfter });
          reorderWidgets(sourceId, id, placeAfter);
        });
      }

      return card;
    };

    activeIds.forEach((id) => widgetList.appendChild(renderWidget(id)));

    if (state.homeEditMode) {
      const handleDocumentDragOver = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest?.('.home-widget');
        if (card) {
          const targetId = card.dataset.widgetId;
          if (targetId && targetId !== draggingId) {
            const rect = card.getBoundingClientRect();
            const placeAfter = (e.clientY - rect.top) > rect.height / 2;
            lastHoverId = targetId;
            lastHoverAfter = placeAfter;
            document.querySelectorAll('.home-widget.drag-over').forEach((node) => {
              node.classList.remove('drag-over', 'drag-over-after');
            });
            card.classList.add('drag-over');
            card.classList.toggle('drag-over-after', placeAfter);
          }
        }
      };

      const handleDocumentDrop = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const sourceId = draggingId;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest?.('.home-widget');
        let targetId = card?.dataset?.widgetId || null;
        let placeAfter = false;
        if (targetId && targetId !== sourceId) {
          const rect = card.getBoundingClientRect();
          placeAfter = (e.clientY - rect.top) > rect.height / 2;
        } else if (lastHoverId && lastHoverId !== sourceId) {
          targetId = lastHoverId;
          placeAfter = !!lastHoverAfter;
        }
        document.querySelectorAll('.home-widget.drag-over').forEach((node) => {
          node.classList.remove('drag-over', 'drag-over-after');
        });
        draggingId = null;
        lastHoverId = null;
        lastHoverAfter = false;
        if (targetId && targetId !== sourceId) {
          console.log('[home-widgets] document drop resolved target', { sourceId, targetId, placeAfter });
          reorderWidgets(sourceId, targetId, placeAfter);
          return;
        }
        const ordered = currentOrder();
        const withoutSource = ordered.filter((w) => w !== sourceId);
        withoutSource.push(sourceId);
        console.log('[home-widgets] document drop fallback append', { sourceId, before: ordered, after: withoutSource });
        state.homeWidgets = withoutSource;
        saveUIState(state);
        renderActiveChatUI();
      };

      const handleDragOver = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.home-widget');
        if (card) {
          const targetId = card.dataset.widgetId;
          if (targetId && targetId !== draggingId) {
            const rect = card.getBoundingClientRect();
            const placeAfter = (e.clientY - rect.top) > rect.height / 2;
            lastHoverId = targetId;
            lastHoverAfter = placeAfter;
            document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
              el.classList.remove('drag-over', 'drag-over-after');
            });
            card.classList.add('drag-over');
            card.classList.toggle('drag-over-after', placeAfter);
          }
        }
      };

      const handleDrop = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const sourceId = draggingId;
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.home-widget');
        let targetId = card?.dataset?.widgetId || null;
        let placeAfter = false;
        if (targetId && targetId !== sourceId) {
          const rect = card.getBoundingClientRect();
          placeAfter = (e.clientY - rect.top) > rect.height / 2;
        } else if (lastHoverId && lastHoverId !== sourceId) {
          targetId = lastHoverId;
          placeAfter = !!lastHoverAfter;
        }
        document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
          el.classList.remove('drag-over', 'drag-over-after');
        });
        draggingId = null;
        lastHoverId = null;
        lastHoverAfter = false;
        if (targetId && targetId !== sourceId) {
          console.log('[home-widgets] drop resolved target', { sourceId, targetId, placeAfter });
          reorderWidgets(sourceId, targetId, placeAfter);
          return;
        }
        const ordered = currentOrder();
        const withoutSource = ordered.filter((w) => w !== sourceId);
        withoutSource.push(sourceId);
        console.log('[home-widgets] drop on empty grid', { sourceId, before: ordered, after: withoutSource });
        state.homeWidgets = withoutSource;
        saveUIState(state);
        renderActiveChatUI();
      };

      widgetList.addEventListener('dragover', handleDragOver, true);
      widgetList.addEventListener('drop', handleDrop, true);
      document.addEventListener('dragover', handleDocumentDragOver, true);
      document.addEventListener('drop', handleDocumentDrop, true);
    }

    layout.appendChild(headerRow);
    layout.appendChild(widgetList);

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

import { applySuggestionToPrompt } from './newchat.js';

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

  // Update assistant content
  const contentEl = root.querySelector('.message-content');
  if (contentEl) {
    if (msg.role === 'assistant' && window.marked) {
      contentEl.innerHTML = sanitizeAssistantHtml(window.marked.parse(msg.content || ''));
    } else {
      contentEl.textContent = (msg.content || '').toString();
    }
  }

  // Update thinking section
  const thinkingWrap = root.querySelector('.thinking');
  const shouldHaveThinking = msg.role === 'assistant' && (msg.thinking || msg._thinkingActive);

  if (!shouldHaveThinking) {
    if (thinkingWrap) thinkingWrap.remove();
    return true;
  }

  let wrap = thinkingWrap;
  if (!wrap) {
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

    const header = root.querySelector('.message-header');
    if (header && header.nextSibling) {
      root.insertBefore(wrap, header.nextSibling);
    } else {
      root.insertBefore(wrap, root.firstChild);
    }
  }

  const toggle = wrap.querySelector('.thinking-toggle');
  const body = wrap.querySelector('.thinking-body');
  if (toggle) {
    toggle.classList.toggle('open', !!msg._thinkingOpen);
    const lbl = toggle.querySelector('.thinking-toggle-label');
    if (lbl) lbl.textContent = msg._thinkingActive ? 'Thinking…' : 'Thinking';
  }
  if (body) {
    body.textContent = msg.thinking || '';
    body.classList.toggle('hidden', !msg._thinkingOpen);
  }

  return true;
}

export function renderMessageElement(msg, { onCopy, onRegenerate, messageIndex } = {}) {
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

  if (msg.role === 'assistant' && window.marked) {
    content.innerHTML = sanitizeAssistantHtml(window.marked.parse(msg.content || ''));
  } else {
    content.textContent = msg.content;
  }

  div.appendChild(header);
  if (msg.role === 'assistant' && (msg.thinking || msg._thinkingActive)) {
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
      + '<path d="M10 16.584V18.9996C10 20.1042 10.8954 20.9996 12 20.9996C13.1046 20.9996 14 20.1042 14 18.9996L14 16.584M12 3V4M18.3643 5.63574L17.6572 6.34285M5.63574 5.63574L6.34285 6.34285M4 12H3M21 12H20M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
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

  if (msg.role === 'assistant' && msg._done !== false) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

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
  onRegenerateMessage
}) {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  const chat = activeChatId === tempChatId ? tempChat : state.chats.find((c) => c.id === activeChatId);

  if (els.trashViewEl) els.trashViewEl.classList.toggle('hidden', state.sidebarSelection.kind !== 'trash');
  const inTrash = state.sidebarSelection.kind === 'trash';
  if (els.messagesEl) els.messagesEl.classList.toggle('hidden', inTrash);
  if (els.promptForm) els.promptForm.classList.toggle('hidden', inTrash);
  if (els.errorEl) els.errorEl.classList.toggle('hidden', inTrash || els.errorEl.textContent === '');

  if (inTrash) return;

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
      'Temporary chats are not saved to history and won\'t appear in the sidebar.';

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

    const toggle = document.createElement('label');
    toggle.className = 'temp-chat-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!state.temporaryChatEnabled;
    checkbox.onchange = () => {
      state.temporaryChatEnabled = checkbox.checked;
      animateSwap(!!state.temporaryChatEnabled);
    };
    const knob = document.createElement('span');
    knob.className = 'temp-chat-switch';
    const text = document.createElement('span');
    text.className = 'temp-chat-toggle-text';
    text.textContent = 'Temporary Chat';
    toggle.appendChild(checkbox);
    toggle.appendChild(knob);
    toggle.appendChild(text);
    layout.appendChild(toggle);

    els.messagesEl.appendChild(layout);
    els.messagesEl.appendChild(typingIndicator);
    els.messagesEl.classList.add('empty');
    return;
  }

  chat.messages.forEach((msg, messageIndex) => {
    els.messagesEl.appendChild(renderMessageElement(msg, {
      onCopy: onCopyMessage,
      onRegenerate: onRegenerateMessage,
      messageIndex
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

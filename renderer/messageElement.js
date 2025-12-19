import { sanitizeAssistantHtml } from './sanitizeAssistantHtml.js';
import {
  createCopyActionButton,
  createDeleteUserActionButton,
  createEditUserActionButton
} from './messageActions.js';

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

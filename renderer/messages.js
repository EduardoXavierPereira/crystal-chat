import { applySuggestionToPrompt } from './newchat.js';

export function renderMessageElement(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;

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
    content.innerHTML = window.marked.parse(msg.content || '');
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
    toggleText.textContent = msg._thinkingActive ? 'Thinking…' : 'Thinking';

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

    thinkingWrap.appendChild(toggle);
    thinkingWrap.appendChild(body);
    div.appendChild(thinkingWrap);
  }
  div.appendChild(content);
  return div;
}

export function renderActiveChat({ els, state, tempChatId, tempChat, typingIndicator, autosizePrompt, onSuggestion }) {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  const chat = activeChatId === tempChatId ? tempChat : state.chats.find((c) => c.id === activeChatId);

  if (els.trashViewEl) els.trashViewEl.classList.toggle('hidden', state.sidebarSelection.kind !== 'trash');
  if (els.favoritesViewEl) els.favoritesViewEl.classList.toggle('hidden', state.sidebarSelection.kind !== 'favorites');
  const inChat = state.sidebarSelection.kind === 'chat';
  if (els.messagesEl) els.messagesEl.classList.toggle('hidden', !inChat);
  if (els.promptForm) els.promptForm.classList.toggle('hidden', !inChat);
  if (els.errorEl) els.errorEl.classList.toggle('hidden', !inChat || els.errorEl.textContent === '');

  if (!inChat) {
    return;
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

  chat.messages.forEach((msg) => {
    els.messagesEl.appendChild(renderMessageElement(msg));
  });
  els.messagesEl.appendChild(typingIndicator);
}

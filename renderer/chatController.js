export function createChatController({
  els,
  state,
  db,
  saveChat,
  saveUIState,
  hideError,
  openConfirm,
  autosizePrompt,
  updateSendButtonEnabled,
  tempChatId,
  chatTitleFromMessages,
  renderActiveChatUI,
  renderChatsUI,
  streamAssistant
}) {
  function getActiveChat() {
    const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
    return activeChatId === tempChatId ? state.tempChat : state.chats.find((c) => c.id === activeChatId);
  }

  async function copyTextToClipboard(text) {
    const toCopy = (text || '').toString();
    if (!toCopy) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(toCopy);
        return;
      }
    } catch {
      // ignore
    }
    const ta = document.createElement('textarea');
    ta.value = toCopy;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    ta.remove();
  }

  async function handleCopyMessage(msg) {
    await copyTextToClipboard(msg?.content || '');
  }

  async function createChat(title) {
    const id = crypto.randomUUID();
    const chat = {
      id,
      title,
      createdAt: Date.now(),
      messages: []
    };
    await saveChat(db, chat);
    state.chats = [chat, ...state.chats];
    return id;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.isStreaming) return;
    if (state.sidebarSelection.kind !== 'chat') return;

    const content = els.promptInput.value.trim();
    if (!content) return;

    hideError(els.errorEl);
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    updateSendButtonEnabled();

    const currentId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
    let chat = currentId === tempChatId ? state.tempChat : state.chats.find((c) => c.id === currentId);
    if (!chat) {
      if (state.temporaryChatEnabled) {
        state.temporaryChatEnabled = false;
        state.tempChat = {
          id: tempChatId,
          title: 'Temporary chat',
          createdAt: Date.now(),
          messages: []
        };
        state.sidebarSelection = { kind: 'chat', id: tempChatId };
        saveUIState(state);
        chat = state.tempChat;
      } else {
        const id = await createChat('New chat');
        state.sidebarSelection = { kind: 'chat', id };
        chat = state.chats.find((c) => c.id === id);
        saveUIState(state);
      }
      state.pendingNew = false;
    }

    const userMsg = { role: 'user', content };
    chat.messages.push(userMsg);
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
    }
    renderActiveChatUI();
    renderChatsUI();

    await streamAssistant(chat);
  }

  async function deleteUserMessageFromIndex(messageIndex) {
    if (typeof messageIndex !== 'number') return;
    if (messageIndex < 0) return;
    if (state.sidebarSelection.kind !== 'chat') return;
    if (state.isStreaming) return;

    const chat = getActiveChat();
    if (!chat) return;
    const msg = chat.messages?.[messageIndex];
    if (!msg || msg.role !== 'user') return;

    chat.messages = chat.messages.slice(0, messageIndex);
    hideError(els.errorEl);
    renderActiveChatUI();
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
      renderChatsUI();
    }
  }

  async function handleDeleteUserMessage(msg, messageIndex) {
    if (!openConfirm) {
      await deleteUserMessageFromIndex(messageIndex);
      return;
    }

    openConfirm(
      els,
      'Delete this user message? This will also delete all messages after it in the chat.',
      async () => {
        await deleteUserMessageFromIndex(messageIndex);
      },
      (v) => (state.confirmAction = v)
    );
  }

  async function handleRegenerateMessage(msg, messageIndex) {
    if (state.isStreaming) return;
    if (!msg || msg.role !== 'assistant') return;
    if (typeof messageIndex !== 'number' || messageIndex < 1) return;
    if (state.sidebarSelection.kind !== 'chat') return;

    const chat = getActiveChat();
    if (!chat) return;

    const prev = chat.messages[messageIndex - 1];
    if (!prev || prev.role !== 'user') return;

    chat.messages = chat.messages.slice(0, messageIndex);
    hideError(els.errorEl);
    renderActiveChatUI();
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
      renderChatsUI();
    }

    await streamAssistant(chat);
  }

  async function commitRename(id, title) {
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) {
      state.renamingId = null;
      renderChatsUI();
      return;
    }
    const nextTitle = title.trim();
    chat.title = nextTitle || chatTitleFromMessages(chat);
    await saveChat(db, chat);
    state.renamingId = null;
    renderChatsUI();
  }

  return {
    createChat,
    handleSubmit,
    handleCopyMessage,
    handleRegenerateMessage,
    handleDeleteUserMessage,
    commitRename,
    getActiveChat
  };
}

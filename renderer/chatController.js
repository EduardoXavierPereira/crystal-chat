import { clearDraft } from './utils/draftManager.js';

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
  streamAssistant,
  getPendingImages,
  getPendingTextFile,
  getPendingFiles,
  clearPendingAttachments
}) {
  function ensureChatStructure(chat) {
    if (!chat || typeof chat !== 'object') return;

    if (!Array.isArray(chat.branches) || chat.branches.length === 0) {
      const legacyMessages = Array.isArray(chat.messages) ? chat.messages : [];
      const branchId = crypto.randomUUID();
      chat.branches = [{ id: branchId, createdAt: Date.now(), forkedFromUserMessageIndex: null, messages: legacyMessages }];
      chat.activeBranchId = branchId;
    }

    if (typeof chat.activeBranchId !== 'string' || !chat.activeBranchId) {
      chat.activeBranchId = chat.branches[0]?.id;
    }

    const active = chat.branches.find((b) => b && b.id === chat.activeBranchId) || chat.branches[0];
    if (!active.messages || !Array.isArray(active.messages)) active.messages = [];

    // Back-compat: many parts of the app still read/write chat.messages.
    chat.messages = active.messages;

    // Ensure message ids exist (used for branch navigation).
    for (const b of chat.branches) {
      if (!b || !Array.isArray(b.messages)) continue;
      for (const m of b.messages) {
        if (!m || typeof m !== 'object') continue;
        if (typeof m.id !== 'string' || !m.id) m.id = crypto.randomUUID();
      }
    }
  }

  function getActiveBranch(chat) {
    ensureChatStructure(chat);
    const branches = Array.isArray(chat?.branches) ? chat.branches : [];
    return branches.find((b) => b && b.id === chat.activeBranchId) || branches[0] || null;
  }

  function setActiveBranch(chat, branchId) {
    if (!chat || typeof chat !== 'object') return;
    ensureChatStructure(chat);
    const next = chat.branches.find((b) => b && b.id === branchId);
    if (!next) return;
    chat.activeBranchId = next.id;
    if (!Array.isArray(next.messages)) next.messages = [];
    chat.messages = next.messages;
  }

  function getActiveChat() {
    const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
    const chat = activeChatId === tempChatId ? state.tempChat : state.chats.find((c) => c.id === activeChatId);
    if (chat) ensureChatStructure(chat);
    return chat;
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
    const branchId = crypto.randomUUID();
    const chat = {
      id,
      title,
      createdAt: Date.now(),
      branches: [{ id: branchId, createdAt: Date.now(), forkedFromUserMessageIndex: null, messages: [] }],
      activeBranchId: branchId,
      messages: []
    };
    // Ensure chat.messages is the active branch array.
    ensureChatStructure(chat);
    await saveChat(db, chat);
    state.chats = [chat, ...state.chats];
    return id;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.isStreaming) return;
    if (state.sidebarSelection.kind !== 'chat') return;

    const pendingImages = getPendingImages?.() || [];
    const pendingTextFile = getPendingTextFile?.() || null;
    const pendingFiles = getPendingFiles?.() || [];

    const rawContent = (els.promptInput.value || '').toString();
    const content = rawContent.trim();
    const hasImages = Array.isArray(pendingImages) && pendingImages.length > 0;
    const hasFiles = Array.isArray(pendingFiles) && pendingFiles.length > 0;
    if (!content && !hasImages && !pendingTextFile && !hasFiles) return;

    const attachmentText = pendingTextFile && pendingTextFile.text
      ? (() => {
          const name = (pendingTextFile.name || 'file').toString();
          const block = `[File: ${name}]\n${(pendingTextFile.text || '').toString()}`;
          return block;
        })()
      : '';

    const isPdfTextFile =
      !!pendingTextFile && (pendingTextFile.type || '').toString().toLowerCase() === 'application/pdf';

    hideError(els.errorEl);
    els.promptInput.value = '';
    autosizePrompt(els.promptInput);
    updateSendButtonEnabled();

    // Clear the floating draft after sending
    clearDraft();

    const currentId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
    let chat = currentId === tempChatId ? state.tempChat : state.chats.find((c) => c.id === currentId);
    if (!chat) {
      if (state.temporaryChatEnabled) {
        state.temporaryChatEnabled = false;
        const branchId = crypto.randomUUID();
        state.tempChat = {
          id: tempChatId,
          title: 'Temporary chat',
          createdAt: Date.now(),
          branches: [{ id: branchId, createdAt: Date.now(), forkedFromUserMessageIndex: null, messages: [] }],
          activeBranchId: branchId,
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

    ensureChatStructure(chat);

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachmentText,
      images: hasImages
        ? pendingImages.map((img) => (img.previewUrl ? img.previewUrl : `data:image/*;base64,${img.base64 || ''}`)).filter(Boolean)
        : undefined,
      files: hasFiles
        ? pendingFiles.map((f) => ({
            name: (f.name || 'file').toString(),
            type: (f.type || '').toString(),
            size: typeof f.size === 'number' ? f.size : 0,
            dataUrl: (f.dataUrl || '').toString()
          }))
        : undefined,
      textFile: pendingTextFile && !isPdfTextFile
        ? {
            name: (pendingTextFile.name || 'file').toString(),
            size: typeof pendingTextFile.size === 'number' ? pendingTextFile.size : 0
          }
        : undefined,
      createdAt: Date.now()
    };
    chat.messages.push(userMsg);

    if (hasImages || pendingTextFile || hasFiles) {
      clearPendingAttachments?.();
    }
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
    ensureChatStructure(chat);
    const msg = chat.messages?.[messageIndex];
    if (!msg || msg.role !== 'user') return;

    const userMsgId = typeof msg.id === 'string' ? msg.id : null;

    // If this user message exists in multiple branches, deleting it should only delete
    // the current branch (so other variants remain selectable).
    if (userMsgId) {
      const branches = Array.isArray(chat.branches) ? chat.branches : [];
      const branchesWithMsg = branches
        .filter((b) => b && Array.isArray(b.messages) && b.messages.some((m) => m && m.role === 'user' && m.id === userMsgId))
        .sort((a, b) => (a?.createdAt || 0) - (b?.createdAt || 0));

      if (branchesWithMsg.length > 1) {
        const activeId = chat.activeBranchId;
        const remaining = branches.filter((b) => b && b.id !== activeId);
        chat.branches = remaining;

        // Switch to the nearest remaining branch that still contains this message.
        const nextBranch = remaining
          .filter((b) => Array.isArray(b?.messages) && b.messages.some((m) => m && m.role === 'user' && m.id === userMsgId))
          .sort((a, b) => (a?.createdAt || 0) - (b?.createdAt || 0))[0];

        chat.activeBranchId = nextBranch?.id || remaining[0]?.id || null;
        ensureChatStructure(chat);

        hideError(els.errorEl);
        renderActiveChatUI();
        if (chat.id !== tempChatId) {
          await saveChat(db, chat);
          renderChatsUI();
        }
        return;
      }
    }

    // Only mutate the active branch. Other branches are preserved.
    const active = getActiveBranch(chat);
    if (!active) return;
    active.messages = (active.messages || []).slice(0, messageIndex);
    chat.messages = active.messages;
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
    ensureChatStructure(chat);

    const prev = chat.messages[messageIndex - 1];
    if (!prev || prev.role !== 'user') return;

    // Fork a new branch from just before the assistant message.
    const active = getActiveBranch(chat);
    if (!active) return;
    const forkedMessages = (active.messages || []).slice(0, messageIndex);
    const newBranchId = crypto.randomUUID();
    chat.branches.push({
      id: newBranchId,
      createdAt: Date.now(),
      forkedFromUserMessageIndex: messageIndex - 1,
      messages: forkedMessages
    });
    setActiveBranch(chat, newBranchId);

    hideError(els.errorEl);
    renderActiveChatUI();
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
      renderChatsUI();
    }

    await streamAssistant(chat);
  }

  function beginEditUserMessage(messageIndex) {
    if (state.isStreaming) return;
    if (typeof messageIndex !== 'number' || messageIndex < 0) return;
    if (state.sidebarSelection.kind !== 'chat') return;
    const chat = getActiveChat();
    if (!chat) return;
    const msg = chat.messages?.[messageIndex];
    if (!msg || msg.role !== 'user') return;
    state.editingUserMessageIndex = messageIndex;
    state.editingUserMessageDraft = (msg.content || '').toString();
    renderActiveChatUI();
  }

  function cancelEditUserMessage() {
    state.editingUserMessageIndex = null;
    state.editingUserMessageDraft = '';
    renderActiveChatUI();
  }

  async function applyEditUserMessage(messageIndex, nextContent) {
    if (state.isStreaming) return;
    if (typeof messageIndex !== 'number' || messageIndex < 0) return;
    if (state.sidebarSelection.kind !== 'chat') return;
    const chat = getActiveChat();
    if (!chat) return;
    ensureChatStructure(chat);
    const active = getActiveBranch(chat);
    if (!active) return;

    const original = active.messages?.[messageIndex];
    if (!original || original.role !== 'user') return;

    const trimmed = (nextContent || '').toString().trim();
    if (!trimmed) return;

    // Fork a new branch from before this user message, replace it, and re-run from there.
    const prefix = (active.messages || []).slice(0, messageIndex);
    const editedUserMsg = { id: original.id, role: 'user', content: trimmed, createdAt: Date.now() };
    const newBranchId = crypto.randomUUID();
    chat.branches.push({
      id: newBranchId,
      createdAt: Date.now(),
      forkedFromUserMessageIndex: messageIndex,
      messages: [...prefix, editedUserMsg]
    });
    setActiveBranch(chat, newBranchId);

    state.editingUserMessageIndex = null;
    state.editingUserMessageDraft = '';
    hideError(els.errorEl);
    renderActiveChatUI();
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
      renderChatsUI();
    }

    await streamAssistant(chat);
  }

  async function switchToBranch(branchId) {
    if (state.isStreaming) return;
    if (state.sidebarSelection.kind !== 'chat') return;
    if (typeof branchId !== 'string' || !branchId) return;
    const chat = getActiveChat();
    if (!chat) return;
    ensureChatStructure(chat);
    setActiveBranch(chat, branchId);
    state.editingUserMessageIndex = null;
    state.editingUserMessageDraft = '';
    hideError(els.errorEl);
    renderActiveChatUI();
    if (chat.id !== tempChatId) {
      await saveChat(db, chat);
      renderChatsUI();
    }
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
    beginEditUserMessage,
    cancelEditUserMessage,
    applyEditUserMessage,
    switchToBranch,
    commitRename,
    getActiveChat
  };
}

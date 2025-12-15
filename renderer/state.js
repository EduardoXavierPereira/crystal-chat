export const API_URL = 'http://localhost:11434/api/chat';
export const MODEL = 'qwen3:4b';

export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful chatbot assistant for Crystal Chat. Reply in the user\'s preferred language.';

export const TEMP_CHAT_ID = '__temp_chat__';
export const UI_STATE_KEY = 'crystal-chat:ui-state';
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function createInitialState() {
  return {
    chats: [],
    isStreaming: false,
    pendingNew: false,
    renamingId: null,
    chatQuery: '',
    trashQuery: '',
    memoriesQuery: '',
    confirmAction: null,
    temporaryChatEnabled: false,
    tempChat: null,
    pinnedOpen: false,
    selectedModel: MODEL,
    creativity: 1,
    textSize: 1,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    sidebarSelection: { kind: 'chat', id: null }
  };
}

export function saveUIState(state) {
  try {
    const toSave = {
      chatQuery: (state.chatQuery || '').toString(),
      pinnedOpen: !!state.pinnedOpen,
      selectedModel: (state.selectedModel || MODEL).toString(),
      creativity: Number.isFinite(state.creativity) ? state.creativity : 1,
      randomness: Number.isFinite(state.creativity) ? state.creativity : 1,
      textSize: Number.isFinite(state.textSize) ? state.textSize : 1,
      systemPrompt: (state.systemPrompt || '').toString(),
      sidebarSelection:
        state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === TEMP_CHAT_ID
          ? { kind: 'chat', id: null }
          : state.sidebarSelection
    };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

export function loadUIState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSidebarSelection(state, next) {
  state.sidebarSelection = next;
  if (next.kind === 'trash' || next.kind === 'memories') {
    state.pendingNew = false;
    state.renamingId = null;
  }
  if (next.kind !== 'chat' || next.id !== TEMP_CHAT_ID) {
    state.temporaryChatEnabled = false;
    state.tempChat = null;
  }
}

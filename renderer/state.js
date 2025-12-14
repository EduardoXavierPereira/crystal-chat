export const API_URL = 'http://localhost:11434/api/chat';
export const MODEL = 'qwen3:4b';

export const TEMP_CHAT_ID = '__temp_chat__';
export const UI_STATE_KEY = 'crystal-chat:ui-state';
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function createInitialState() {
  return {
    chats: [],
    isStreaming: false,
    pendingNew: false,
    renamingId: null,
    trashQuery: '',
    confirmAction: null,
    temporaryChatEnabled: false,
    tempChat: null,
    pinnedOpen: false,
    sidebarSelection: { kind: 'chat', id: null }
  };
}

export function saveUIState(state) {
  try {
    const toSave = {
      pinnedOpen: !!state.pinnedOpen,
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
  if (next.kind === 'trash') {
    state.pendingNew = false;
    state.renamingId = null;
  }
  if (next.kind !== 'chat' || next.id !== TEMP_CHAT_ID) {
    state.temporaryChatEnabled = false;
    state.tempChat = null;
  }
}

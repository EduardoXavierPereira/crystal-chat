export const API_URL = 'http://localhost:11435/api/chat';
export const MODEL = 'qwen3-vl:4b-instruct';

export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful chatbot assistant for Crystal Chat. Reply in the user\'s preferred language.';

export const TEMP_CHAT_ID = '__temp_chat__';
export const UI_STATE_KEY = 'crystal-chat:ui-state';
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function createInitialState() {
  return {
    chats: [],
    isStreaming: false,
    pendingNew: false,
    pendingImages: [],
    pendingFiles: [],
    pendingTextFile: null,
    homeWidgets: ['intro', 'suggestions', 'temp-toggle'],
    homeEditMode: false,
    renamingId: null,
    editingUserMessageIndex: null,
    editingUserMessageDraft: '',
    chatQuery: '',
    trashQuery: '',
    memoriesQuery: '',
    theme: 'system',
    accent: '#7fc9ff',
    confirmAction: null,
    temporaryChatEnabled: false,
    tempChat: null,
    foldersOpen: true,
    selectedModel: MODEL,
    creativity: 1,
    textSize: 1,
    magneticScroll: false,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    enableInternet: false,
    updateMemoryEnabled: true,
    folders: [],
    rootChatIds: [],
    sidebarSelection: { kind: 'chat', id: null },
    // Individual tool state (all disabled by default)
    toolEnabled_web_search: false,
    toolEnabled_open_link: false,
    toolEnabled_file_read: false,
    toolEnabled_file_write: false,
    toolEnabled_file_edit: false,
    toolEnabled_file_glob: false,
    toolEnabled_file_grep: false,
    toolEnabled_folder_browse: false
  };
}

export function saveUIState(state) {
  try {
    const toSave = {
      chatQuery: (state.chatQuery || '').toString(),
      foldersOpen: typeof state.foldersOpen === 'boolean' ? state.foldersOpen : true,
      selectedModel: (state.selectedModel || MODEL).toString(),
      creativity: Number.isFinite(state.creativity) ? state.creativity : 1,
      randomness: Number.isFinite(state.creativity) ? state.creativity : 1,
      textSize: Number.isFinite(state.textSize) ? state.textSize : 1,
      magneticScroll: !!state.magneticScroll,
      systemPrompt: (state.systemPrompt || '').toString(),
      enableInternet: !!state.enableInternet,
      updateMemoryEnabled: typeof state.updateMemoryEnabled === 'boolean' ? state.updateMemoryEnabled : true,
      theme: (state.theme || 'system').toString(),
      accent: (state.accent || '#7fc9ff').toString(),
      folders: Array.isArray(state.folders) ? state.folders : [],
      rootChatIds: Array.isArray(state.rootChatIds) ? state.rootChatIds : [],
      homeWidgets: Array.isArray(state.homeWidgets) ? state.homeWidgets : ['intro', 'suggestions', 'temp-toggle'],
      homeEditMode: !!state.homeEditMode,
      sidebarSelection:
        state.sidebarSelection.kind === 'chat' && state.sidebarSelection.id === TEMP_CHAT_ID
          ? { kind: 'chat', id: null }
          : state.sidebarSelection,
      // Individual tool states
      toolEnabled_web_search: !!state.toolEnabled_web_search,
      toolEnabled_open_link: !!state.toolEnabled_open_link,
      toolEnabled_file_read: !!state.toolEnabled_file_read,
      toolEnabled_file_write: !!state.toolEnabled_file_write,
      toolEnabled_file_edit: !!state.toolEnabled_file_edit,
      toolEnabled_file_glob: !!state.toolEnabled_file_glob,
      toolEnabled_file_grep: !!state.toolEnabled_file_grep,
      toolEnabled_folder_browse: !!state.toolEnabled_folder_browse
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
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.enableInternet === 'undefined') {
        parsed.enableInternet = !!(parsed.enableWebSearch || parsed.enableOpenLink);
      }
      if (typeof parsed.updateMemoryEnabled === 'undefined') {
        parsed.updateMemoryEnabled = true;
      }
      if (typeof parsed.theme === 'undefined') {
        parsed.theme = 'system';
      }
      if (typeof parsed.accent === 'undefined') {
        parsed.accent = '#7fc9ff';
      }
      if (!Array.isArray(parsed.folders)) {
        parsed.folders = [];
      }
      if (!Array.isArray(parsed.rootChatIds)) {
        parsed.rootChatIds = [];
      }
      if (!Array.isArray(parsed.homeWidgets)) {
        parsed.homeWidgets = ['intro', 'suggestions', 'temp-toggle'];
      }
      if (typeof parsed.homeEditMode === 'undefined') {
        parsed.homeEditMode = false;
      }
      if (typeof parsed.foldersOpen === 'undefined') {
        parsed.foldersOpen = true;
      }
      // Initialize individual tool states (all default to false/disabled)
      if (typeof parsed.toolEnabled_web_search === 'undefined') {
        parsed.toolEnabled_web_search = false;
      }
      if (typeof parsed.toolEnabled_open_link === 'undefined') {
        parsed.toolEnabled_open_link = false;
      }
      if (typeof parsed.toolEnabled_file_read === 'undefined') {
        parsed.toolEnabled_file_read = false;
      }
      if (typeof parsed.toolEnabled_file_write === 'undefined') {
        parsed.toolEnabled_file_write = false;
      }
      if (typeof parsed.toolEnabled_file_edit === 'undefined') {
        parsed.toolEnabled_file_edit = false;
      }
      if (typeof parsed.toolEnabled_file_glob === 'undefined') {
        parsed.toolEnabled_file_glob = false;
      }
      if (typeof parsed.toolEnabled_file_grep === 'undefined') {
        parsed.toolEnabled_file_grep = false;
      }
      if (typeof parsed.toolEnabled_folder_browse === 'undefined') {
        parsed.toolEnabled_folder_browse = false;
      }
    }
    return parsed;
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
  if (next.kind === 'chat' && next.id !== null && next.id !== TEMP_CHAT_ID) {
    state.pendingNew = false;
  }
  if (next.kind !== 'chat' || next.id !== TEMP_CHAT_ID) {
    state.temporaryChatEnabled = false;
    state.tempChat = null;
  }
}

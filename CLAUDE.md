# Crystal Chat - Codebase Overview

A comprehensive guide for future development sessions.

## Quick Summary

**Crystal Chat** is a privacy-focused, open-source local AI chat client built with Electron. It uses Ollama for local AI inference, stores all data locally, and provides features like conversation branching, long-term memory (RAG), multimodal input (text/images/files), and integrated tools (web search, file I/O).

**Version:** 0.9.0
**Key Tech:** Electron 30, Vanilla JS (ES6 modules), IndexedDB, Golden Layout, Ollama

---

## Quick Navigation

- **Main entry:** `main.js` (Electron) → `renderer/renderer.js` (UI orchestrator)
- **Chat logic:** `renderer/chatController.js` (operations), `renderer/streamingController.js` (AI responses)
- **Database:** `renderer/db.js` (IndexedDB wrapper)
- **UI bindings:** `renderer/uiBindings.js` (refactored into modular controllers)
- **State:** `renderer/state.js` (global app state)

---

## Architecture Overview

### Process Model

```
main.js (Electron main process)
├── Window creation
├── IPC handlers (Ollama, tools, updater)
└── Auto-update system

↓ IPC Bridge (preload.js)

renderer/renderer.js (Orchestrator)
├── Initialize all controllers
├── Setup Ollama connection
├── Load UI state
└── Attach event listeners
```

### Key Modules

#### State & Database

| File | Purpose |
|------|---------|
| `renderer/state.js` | Global app state (chats, UI settings, tool toggles) |
| `renderer/db.js` | IndexedDB wrapper (chats, memories stores) |
| `renderer/state/attachmentState.js` | Pending file attachments |

#### Chat & Messages

| File | Purpose |
|------|---------|
| `renderer/chatController.js` | Chat CRUD, branching, message operations |
| `renderer/streamingController.js` | AI response streaming, memory updates, tool execution |
| `renderer/messages.js` | Main chat rendering orchestration |
| `renderer/messageElement.js` | Single message DOM creation & rendering |
| `renderer/messageUpdate.js` | Message update utilities |

#### Features

| File | Purpose |
|------|---------|
| `renderer/memories.js` | Memory system (embeddings, similarity) |
| `renderer/memoriesActions.js` | Memory CRUD operations |
| `renderer/trash.js` | Trash list rendering |
| `renderer/trashActions.js` | Restore/permanent delete |
| `renderer/folders.js` | Folder tree rendering |
| `renderer/foldersActions.js` | Folder CRUD, drag-drop |
| `renderer/pinned.js` | Pinned chats dropdown |
| `renderer/pinnedActions.js` | Pin/unpin operations |

#### UI & Controls

| File | Purpose |
|------|---------|
| `renderer/uiBindings.js` | Master coordinator for all UI event listeners |
| `renderer/uiModules/PromptInputController.js` | Input field, keyboard shortcuts, paste/drop |
| `renderer/uiModules/FileAttachmentHandler.js` | Image/PDF/file handling |
| `renderer/uiModules/ThemeController.js` | Theme & accent management |
| `renderer/uiModules/SidebarController.js` | Sidebar (memories/trash) interactions |
| `renderer/uiModules/PopoverManager.js` | Hover-based popover behavior |
| `renderer/uiModules/SelectionAskButton.js` | Text selection button |
| `renderer/sidebar.js` | Chat list & search |
| `renderer/dockLayout.js` | Golden Layout panel management |

#### Tools System

| File | Purpose |
|------|---------|
| `renderer/tools/registry.js` | Tool manager, parsing, execution |
| `renderer/tools/webSearch.js` | Web search tool |
| `renderer/tools/openLink.js` | Fetch web pages tool |
| `renderer/tools/fileRead.js` | File read tool |
| `renderer/tools/fileWrite.js` | File write tool |
| `renderer/tools/fileEdit.js` | File edit (find/replace) tool |
| `renderer/tools/fileGlob.js` | File glob tool |
| `renderer/tools/fileGrep.js` | File grep tool |
| `renderer/tools/folderBrowse.js` | Folder browse tool |

#### UI Components & Utilities

| File | Purpose |
|------|---------|
| `renderer/ui/themeManager.js` | Theme application logic |
| `renderer/ui/popoverManager.js` | Popover state tracking |
| `renderer/ui/magneticScroll.js` | Sticky scroll behavior |
| `renderer/modals/setupModal.js` | First-run setup UI |
| `renderer/modals/updateModal.js` | Update notification modal |
| `renderer/ollama.js` | Ollama API integration (streaming, embeddings) |
| `renderer/init.js` | App initialization flow |
| `renderer/setupController.js` | Model installation UI |

#### Main Process (IPC & Tools)

| Directory | Purpose |
|-----------|---------|
| `src/main/ipc/` | IPC handlers (ollama, tools) |
| `src/main/ollama/` | Ollama management (server, installer, models) |
| `src/main/tools/` | Tool implementations (web search, file I/O) |
| `src/main/utils/` | Utilities (HTTP, process spawning) |

---

## Recent Refactoring: UI Bindings Module

**Status:** ✓ Completed (all modules syntax-checked and working)

The massive `uiBindings.js` (1,070 lines) was refactored into 6 focused modules:

### New Structure

```
renderer/uiBindings.js (120 lines) - Orchestrator only
├── uiModules/
│   ├── FileAttachmentHandler.js
│   ├── PromptInputController.js
│   ├── ThemeController.js
│   ├── SidebarController.js
│   ├── PopoverManager.js
│   └── SelectionAskButton.js
```

### Benefits

- ✓ Each file ~100-200 lines (vs 1,070 in original)
- ✓ Easy to locate and modify specific features
- ✓ Clear separation of concerns
- ✓ Reusable components (PopoverManager)
- ✓ No 28-parameter functions

### How to Add Features

Example: Add a new button listener to theme controls
1. Open `renderer/uiModules/ThemeController.js`
2. Add listener in `attachListeners()` method
3. Done - no massive parameter lists to update

---

## State Structure

### Global State (`renderer/state.js`)

```javascript
{
  // Chat data
  chats: [],
  sidebarSelection: { kind: 'chat', id: null },
  rootChatIds: [],
  folders: [],

  // UI state
  theme: 'system',              // 'dark', 'light'
  accent: '#7fc9ff',
  textSize: 1.0,
  magneticScroll: true,
  readOnlyMode: false,

  // Features
  updateMemoryEnabled: true,
  createdMemoriesThisSession: [],

  // Streaming
  isStreaming: false,
  pendingNew: false,

  // Attachments
  pendingImages: [],
  pendingFiles: [],
  pendingTextFile: null,

  // Tool toggles
  toolEnabled_web_search: false,
  toolEnabled_file_read: false,
  toolEnabled_file_write: false,
  toolEnabled_file_edit: false,
  toolEnabled_file_glob: false,
  toolEnabled_file_grep: false,
  toolEnabled_folder_browse: false,
  toolEnabled_open_link: false,

  // Settings
  systemPrompt: '...',
  creativity: 0.7
}
```

### Chat Structure

```javascript
{
  id: "uuid",
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,                    // Set when trashed
  pinned: false,
  folderId: null,                     // null = root
  parentId: null,                     // For sub-conversations
  activeBranchId: "uuid",
  branches: [
    {
      id: "uuid",
      createdAt: timestamp,
      forkedFromUserMessageIndex: 5,  // null = main branch
      messages: [
        {
          id: "uuid",
          role: "user" | "assistant",
          content: "text",
          images: ["base64,data..."]
        }
      ]
    }
  ]
}
```

### Database Structure

**Database:** `'crystal-chat'` (v2)

**Object Stores:**

| Store | Keys | Indices | Purpose |
|-------|------|---------|---------|
| `chats` | `id` | `createdAt` | Chat messages & metadata |
| `memories` | `id` | `b0`, `b1`, `b2`, `b3` (hash buckets) | RAG embeddings |

---

## Key Flows

### Initialize App

1. `main.js` → Electron app ready
2. Creates BrowserWindow, loads `renderer/index.html`
3. `renderer.js` imports all controllers
4. `init.js` runs:
   - Check Ollama running (auto-start if needed)
   - Load UI state from localStorage
   - Load chats from IndexedDB
   - Show setup modal if first run
5. Ready for chat

### Send Message

1. User types in prompt input, hits Enter
2. `PromptInputController` calls `handleSubmit()`
3. `ChatController.sendMessage()` - queue user message
4. UI updates immediately
5. `StreamingController.streamAssistant()` - call Ollama
6. Tokens streamed to DOM in real-time
7. After response complete:
   - Save to DB
   - Update memories if enabled
   - Execute any tools in response

### Stream Chat Completion

```javascript
await streamChat({
  apiUrl: 'http://localhost:11435/api/chat',
  model: 'qwen3-vl:4b-instruct',
  temperature: state.creativity,
  messages: formatMessages(chat),
  onToken: (token) => updateDOM(token),
  onThinking: (thinking) => showThinking(thinking),
  onFinal: (finalText) => saveToDB(finalText),
  signal: abortController.signal
});
```

### Parse & Execute Tools

1. `streamingController.js` checks response for tool calls
2. `tools/registry.js` parses: `{"title":"web_search","arguments":{"q":"..."}}`
3. Call IPC: `electronAPI.executeTool(toolId, args)`
4. Main process (`src/main/ipc/tools-handlers.js`) executes
5. Result piped back to AI context
6. Next response generated with tool output

### Update Long-Term Memory

1. After chat completes (if `updateMemoryEnabled`)
2. Extract key facts from conversation
3. Call Ollama embedding API for each fact
4. Store in IndexedDB with vector index
5. Next chat: retrieve similar memories via cosine similarity
6. Include memories in system context

---

## Common Tasks

### Adding a New Tool

1. Create `renderer/tools/myTool.js`:
```javascript
export const myTool = {
  title: 'my_tool',
  schema: {
    type: 'object',
    properties: { /* define params */ }
  },
  description: 'What this tool does'
};
```

2. Register in `renderer/tools/registry.js`:
```javascript
export function getAvailableTools() {
  return [
    // ...existing
    myTool
  ];
}
```

3. Add IPC handler in `src/main/ipc/tools-handlers.js`

### Adding a UI Feature

1. Check if it belongs in existing module (e.g., theme? → `ThemeController`)
2. If new module needed:
   - Create `renderer/uiModules/MyFeatureController.js`
   - Import in `renderer/uiBindings.js`
   - Instantiate with required deps
3. Attach listeners in module constructor

### Fixing a Chat Display Bug

1. Check `renderer/messageElement.js` (DOM creation)
2. Check `renderer/messages.js` (rendering logic)
3. Check `renderer/messageUpdate.js` (update utilities)

### Modifying Theme System

1. Open `renderer/uiModules/ThemeController.js`
2. Modify `applyThemeAndAccent()` or `resolveTheme()`
3. Update CSS variables in `renderer/index.html` `<style>`

### Adding Ollama Settings

1. Add to `state.js` initializer
2. Add setting control in `renderer/index.html` settings panel
3. Add listener in appropriate UI module
4. Save with `saveUIState(state)`

---

## Important Design Patterns

### Functional Module Pattern

```javascript
// Instead of classes, modules export factory functions
export function createChatController({ els, state, db, ... }) {
  return {
    createChat: () => { ... },
    saveActiveChat: () => { ... }
  };
}
```

### Dependency Injection

All controllers receive their dependencies as constructor params:
```javascript
new MyController({
  els,           // DOM elements
  state,         // Global state
  db,            // Database
  signal,        // AbortController signal
  callbacks      // Event handlers
});
```

### State Immutability (mostly)

- Mutate `state` directly (no Redux)
- Call `saveUIState(state)` after mutations
- Render via `renderChatsUI()` or `renderActiveChat()`

### Abort Signal Pattern

All event listeners use AbortController:
```javascript
const signal = bindingsAbort.signal;
element.addEventListener('click', handler, { signal });
// Cleanup: bindingsAbort.abort()
```

---

## Ollama Integration

### Default Model

**Model:** `qwen3-vl:4b-instruct`
- Reasoning-enabled (can use `<think>` tags)
- Vision-capable
- ~4B parameters
- Good balance of speed/quality for local use

### Embedding Model

**Model:** `embeddinggemma`
- Auto-installed on first memory update
- 768-dimensional vectors
- Used for RAG memory retrieval

### API Endpoint

```
http://localhost:11435/api/chat

POST /api/chat
{
  "model": "qwen3-vl:4b-instruct",
  "messages": [...],
  "temperature": 0.7,
  "stream": true
}
```

Response: Newline-delimited JSON with tokens

### Message Format

```javascript
{
  role: "user" | "assistant",
  content: "text content",
  images: ["data:image/png;base64,..."]  // Optional
}
```

---

## Debugging Tips

### Enable Debug Logging

Set in browser DevTools console:
```javascript
window.__ccDebugFolders = true;     // Folder operations
window.__ccDebugMemories = true;    // Memory operations
```

### Check IndexedDB

DevTools → Application → IndexedDB → `crystal-chat`:
- `chats` store - inspect chat structure
- `memories` store - inspect embeddings

### Monitor IPC Messages

In `preload.js`, add:
```javascript
console.log('IPC call:', channel, args);
```

### Check Ollama Connection

Open DevTools console:
```javascript
await window.electronAPI.checkOllama()
```

### View State

In console:
```javascript
// Access global state (if exported)
// May need to add to renderer.js first
```

---

## Performance Considerations

1. **Message Rendering:** `messageElement.js` creates DOM nodes - large chats slow to load
   - Consider virtual scrolling if chat has 1000+ messages

2. **Memory Vectors:** Storing embeddings in IndexedDB
   - Memories with >50k embeddings may slow search

3. **UI Layout:** Golden Layout can be heavy with many panels
   - Keep layout changes minimal during chat streaming

4. **File Handling:** PDF extraction limited to 25 pages, 200k chars
   - Larger PDFs truncated silently

5. **Attachment Uploads:** Images base64-encoded in memory
   - Large image sets may consume RAM

---

## File Size Summary

| Module | Lines | Type | Refactored? |
|--------|-------|------|-------------|
| uiBindings.js | 1,070 → 360 | Core | ✓ Yes (6 modules) |
| streamingController.js | 859 | Core | - |
| foldersActions.js | 918 | Feature | - |
| uiBindings.js (old) | 1,070 | Core | ✓ Yes |

---

## Next Refactoring Opportunities

1. **StreamingController** (859 lines) - Split into:
   - MemoryEditorController
   - MemoryMatcher utility
   - TypedIndicatorSpinner
   - Streaming orchestrator

2. **FoldersActions** (918 lines) - Extract:
   - FolderTreeManager utility
   - FolderDragDropHandler
   - EmojiBank config

3. **Duplicate Patterns** - Create shared utilities:
   - `LazyBindings` helper
   - `SafeEventDispatcher`
   - `ModalManager` base class

---

## Version History

- **0.9.0** - Current (refactored UI bindings)
- **0.8.1** - Previous
- (See git log for full history)

---

## Useful Commands

```bash
# Start dev
npm start

# Build
npm run dist              # All platforms
npm run dist:win          # Windows
npm run dist:mac          # macOS
npm run dist:linux        # Linux

# Test
npm run cypress:open      # Interactive
npm run cypress:run       # Headless

# Serve for testing
npm run serve:renderer    # http://localhost:4177
```

---

## Quick Links

- **Git repo:** (check git origin)
- **Issues/PRs:** Check GitHub
- **Electron docs:** https://www.electronjs.org/docs
- **Ollama API:** https://github.com/ollama/ollama/blob/main/docs/api.md
- **Golden Layout:** https://golden-layout.com/

---

**Last Updated:** 2025-12-22
**Status:** Ready for development

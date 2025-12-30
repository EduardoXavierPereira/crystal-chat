# Crystal Chat

Crystal Chat is a privacy-focused, open-source local AI chat client powered by Ollama.

- No accounts
- No cloud chat storage
- Automatic local inference

## Features

- Long-term memory (local): retrieval-augmented memory stored locally (IndexedDB). Memories can be retrieved into the prompt and automatically created/updated/deleted after chats.
- Multimodal input: attach images and text files to messages.
- Modular dockable UI: multi-panel layout (History / Settings / Memories / Trash / Chat) with persistent, user-customizable docking.
- Optional tool mode: enable tools like web search, opening links, and reading local files (all gated behind a toggle).
- Conversation branching: keep alternate variants of a conversation and switch between them.
- Trashcan: deleted chats stay in Trash for 30 days, so you can restore them within that time.
- Temporary chat: chat without saving to local history (and without updating long-term memory).
- Pinned chats: pin important chats to find them quickly.

## How it works

Crystal Chat is an Electron app. The renderer calls the local Ollama Chat API:

- `http://localhost:11435/api/chat`

By default it uses the model configured in `renderer/state.js` (currently `qwen3-vl:4b`).

During setup, the app also installs an Ollama embeddings model (`embeddinggemma`) to power local long-term memory (embedding + retrieval).

If tool mode is enabled, the model can request tool calls (web search, open link, read local file) which are executed via Electron IPC and the results are fed back into the conversation.

## Requirements

- Node.js (LTS recommended)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the app:

   ```bash
   npm start
   ```

3. Wait for the installation process in the app UI (this may take a few minutes). The app will automatically download and install the required Ollama models.

## Development

- Start Electron:

  ```bash
  npm start
  ```

- Run Cypress e2e tests:

  ```bash
  npm run e2e:open
  ```

## Privacy notes

- Chats are stored locally on your machine.
- Temporary chats are not saved to local history.
- Deleted chats are moved to Trash and are automatically purged after the retention window.
- All AI inference happens locally on your machine using Ollama.


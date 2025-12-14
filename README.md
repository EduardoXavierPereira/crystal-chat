# Crystal Chat

Crystal Chat is a privacy-focused, open-source local AI chat client powered by Ollama.

- No accounts
- No cloud chat storage
- Local model execution via your own Ollama instance

## Features

- Trashcan: deleted chats stay in Trash for 30 days by default, so you can restore them anytime.
- Temporary chat: toggle this on to chat without saving to local history.
- Pinned chats: pin important chats to find them quickly.

## How it works

Crystal Chat is an Electron app. The renderer calls the local Ollama Chat API:

- `http://localhost:11435/api/chat`

By default it uses the model configured in `renderer/state.js` (currently `qwen3:4b`).

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

3. Go through the setup process in the app.

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

## License

Apache License 2.0
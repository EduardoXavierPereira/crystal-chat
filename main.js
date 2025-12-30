const path = require('path');

// IMPORTANT: Electron must be required FIRST before any other local modules
// that also require electron, otherwise app will be undefined
const { app, BrowserWindow, ipcMain } = require('electron');

// Import our modular components
const { setupAutoUpdater, registerUpdaterHandlers } = require('./src/main/updater');
const { registerOllamaHandlers } = require('./src/main/ipc/ollama-handlers');
const { registerToolsHandlers } = require('./src/main/ipc/tools-handlers');

const isDev = process.env.NODE_ENV === 'development';

const OLLAMA_HOST = '127.0.0.1:11435';
const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}`;
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'http://localhost:3000/api/updates';

let mainWindow = null;

// Shared state object for modules
const state = {
  ollamaServeProc: null,
  updateAvailableInfo: null
};

/**
 * Send an event to the renderer process
 * @param {string} channel - IPC channel name
 * @param {object} payload - Payload to send
 */
function sendToRenderer(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch {
    // ignore
  }
}

/**
 * Send updater event to renderer
 * @param {string} channel - IPC channel name
 * @param {object} payload - Payload to send
 */
function sendUpdaterEvent(channel, payload) {
  sendToRenderer(channel, payload);
}

/**
 * Send Ollama setup progress to renderer
 * @param {object} payload - Progress payload
 */
function sendSetupProgress(payload) {
  sendToRenderer('ollama:setup-progress', payload);
}

/**
 * Create the main application window
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: '#0b1021',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    autoHideMenuBar: true
  });

  mainWindow = win;

  win.webContents.on('did-finish-load', () => {
    if (state.updateAvailableInfo) {
      sendUpdaterEvent('updater:update-available', {
        version: state.updateAvailableInfo?.version || null,
        releaseName: state.updateAvailableInfo?.releaseName || null,
        releaseNotes: state.updateAvailableInfo?.releaseNotes || null
      });
    }
  });

  win.loadFile('renderer/index.html');
  win.maximize();

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// Electron app configuration
// Note: These must be called before app.whenReady()
if (app && app.commandLine) {
  app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar,OverlayScrollbars');
  app.commandLine.appendSwitch('disable-overlay-scrollbar');
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Register all IPC handlers
  registerOllamaHandlers(OLLAMA_BASE_URL, OLLAMA_HOST, state, sendSetupProgress);
  registerToolsHandlers(mainWindow);
  registerUpdaterHandlers(app, state);

  // Setup auto-updater
  setupAutoUpdater(app, sendUpdaterEvent, state, UPDATE_SERVER_URL);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (state.ollamaServeProc) {
    state.ollamaServeProc.kill();
  }
});

// Simple ping handler
ipcMain.handle('ping', () => 'pong');

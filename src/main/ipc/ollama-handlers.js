const { ipcMain } = require('electron');
const { hasCommand, spawnWithOutput, buildOllamaEnv } = require('../utils/process-utils');
const { hasOllamaModel, listOllamaModels } = require('../ollama/model-manager');
const { isOllamaServerReachable, ensureOllamaServer } = require('../ollama/server-manager');
const { installOllamaBestEffort } = require('../ollama/installer');
const { resolveOllamaCommand } = require('../ollama/path-detector');

/**
 * Ollama IPC handlers.
 * Handles all Ollama-related IPC communication between renderer and main process.
 */

/**
 * Register Ollama IPC handlers
 * @param {string} baseUrl - Base URL for Ollama server
 * @param {string} ollamaHost - Ollama host string (e.g., '127.0.0.1:11435')
 * @param {object} state - Shared state object (contains ollamaServeProc)
 * @param {Function} sendSetupProgress - Function to send progress to renderer
 */
function registerOllamaHandlers(baseUrl, ollamaHost, state, sendSetupProgress) {
  ipcMain.handle('ollama:getApiUrl', async () => {
    return { apiUrl: `${baseUrl}/api/chat`, baseUrl, host: ollamaHost };
  });

  ipcMain.handle('ollama:check', async () => {
    const hasBinary = await hasCommand('ollama');
    const serverReachable = await isOllamaServerReachable(baseUrl);
    let models = [];
    if (serverReachable) {
      try {
        models = await listOllamaModels(baseUrl);
      } catch {
        models = [];
      }
    }
    return {
      hasBinary,
      serverReachable,
      models,
      hasQwen3_4b: await hasOllamaModel(baseUrl, 'qwen3-vl:4b')
    };
  });

  ipcMain.handle('ollama:hasModel', async (_evt, { model }) => {
    const ok = await hasOllamaModel(baseUrl, model);
    return { ok };
  });

  ipcMain.handle('ollama:ensureServer', async () => {
    const res = await ensureOllamaServer(baseUrl, ollamaHost, state, sendSetupProgress);
    return res;
  });

  ipcMain.handle('ollama:install', async () => {
    const res = await installOllamaBestEffort(sendSetupProgress);
    sendSetupProgress({
      kind: res.ok ? 'done' : 'error',
      stage: 'install',
      message: res.ok ? 'Ollama installed.' : 'Ollama install failed.'
    });
    return res;
  });

  ipcMain.handle('ollama:pullModel', async (_evt, { model }) => {
    const server = await ensureOllamaServer(baseUrl, ollamaHost, state, sendSetupProgress);
    if (!server.ok) {
      return { ok: false, reason: 'server_not_ready', server };
    }
    const m = (model || '').toString().trim();
    const stage = m === 'embeddinggemma' ? 'pull-embedding' : 'pull-model';

    sendSetupProgress({
      kind: 'stage',
      stage,
      message: stage === 'pull-embedding' ? `Downloading embeddings model: ${m}` : `Downloading model: ${m}`
    });

    const ollamaCmd = await resolveOllamaCommand();
    const p = spawnWithOutput(ollamaCmd, ['pull', m], { env: buildOllamaEnv(ollamaHost) }, sendSetupProgress);
    const code = await new Promise((resolve) => p.on('close', resolve));
    const res = { ok: code === 0, code };
    sendSetupProgress({
      kind: res.ok ? 'done' : 'error',
      stage,
      message: res.ok
        ? stage === 'pull-embedding'
          ? 'Embeddings model ready.'
          : 'Model ready.'
        : stage === 'pull-embedding'
          ? 'Embeddings model download failed.'
          : 'Model download failed.'
    });
    return res;
  });
}

module.exports = {
  registerOllamaHandlers
};

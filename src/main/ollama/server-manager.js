const { spawn } = require('child_process');
const { httpJson } = require('../utils/http-client');
const { sleep, buildOllamaEnv, hasCommand } = require('../utils/process-utils');
const { resolveOllamaCommand } = require('./path-detector');

/**
 * Ollama server management utilities.
 * Handles starting and checking the Ollama server.
 */

/**
 * Check if Ollama server is reachable
 * @param {string} baseUrl - Base URL for Ollama server
 * @returns {Promise<boolean>}
 */
async function isOllamaServerReachable(baseUrl) {
  try {
    await httpJson(`${baseUrl}/api/version`, { timeoutMs: 1200 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure Ollama server is running
 * @param {string} baseUrl - Base URL for Ollama server
 * @param {string} ollamaHost - Ollama host string (e.g., '127.0.0.1:11435')
 * @param {object} state - Server state object (contains ollamaServeProc)
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Result object with ok and optional reason/error
 */
async function ensureOllamaServer(baseUrl, ollamaHost, state, onProgress) {
  if (await isOllamaServerReachable(baseUrl)) {
    return { ok: true };
  }

  const hasBin = await hasCommand('ollama');
  if (!hasBin) {
    return { ok: false, reason: 'missing_binary' };
  }

  if (state.ollamaServeProc && !state.ollamaServeProc.killed) {
    // already started by us; give it another moment
  } else {
    onProgress({ kind: 'stage', stage: 'start-server', message: 'Starting Ollama server...' });

    try {
      const ollamaCmd = await resolveOllamaCommand();
      state.ollamaServeProc = spawn(ollamaCmd, ['serve'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildOllamaEnv(ollamaHost),
        windowsHide: true
      });
      state.ollamaServeProc.unref();
      state.ollamaServeProc.on('error', (e) => {
        onProgress({ kind: 'error', stage: 'start-server', message: e.message || String(e) });
      });
      state.ollamaServeProc.stdout?.on('data', () => {});
      state.ollamaServeProc.stderr?.on('data', () => {});
    } catch (e) {
      return { ok: false, reason: 'failed_to_spawn', error: e?.message || String(e) };
    }
  }

  // Ollama can take longer than 10s to become reachable on first run
  const maxChecks = 60;
  for (let i = 0; i < maxChecks; i++) {
    if (await isOllamaServerReachable(baseUrl)) {
      return { ok: true };
    }
    // Internal progress signal (renderer parses % but does not show logs)
    const pct = Math.round(((i + 1) / maxChecks) * 100);
    onProgress({ kind: 'log', stream: 'stdout', line: `${pct}%` });
    await sleep(500);
  }
  return { ok: false, reason: 'server_unreachable' };
}

module.exports = {
  isOllamaServerReachable,
  ensureOllamaServer
};

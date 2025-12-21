const { httpJson, httpPostJson } = require('../utils/http-client');
const { spawnWithOutput, buildOllamaEnv } = require('../utils/process-utils');
const { resolveOllamaCommand } = require('./path-detector');
const { isOllamaServerReachable } = require('./server-manager');

/**
 * Ollama model management utilities.
 * Handles listing, checking, and pulling Ollama models.
 */

/**
 * List all locally available Ollama models
 * @param {string} baseUrl - Base URL for Ollama server
 * @returns {Promise<Array<string>>} Array of model names
 */
async function listOllamaModels(baseUrl) {
  const json = await httpJson(`${baseUrl}/api/tags`, { timeoutMs: 2500 });
  const models = Array.isArray(json?.models) ? json.models : [];
  return models.map((m) => (m && m.name ? String(m.name) : '')).filter(Boolean);
}

/**
 * Check if a specific model is available locally
 * @param {string} baseUrl - Base URL for Ollama server
 * @param {string} model - Model name to check
 * @returns {Promise<boolean>}
 */
async function hasOllamaModel(baseUrl, model) {
  const name = (model || '').toString().trim();
  if (!name) return false;
  if (!(await isOllamaServerReachable(baseUrl))) return false;
  try {
    // /api/show returns 200 when the model exists locally
    await httpPostJson(`${baseUrl}/api/show`, { name }, { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pull a model from Ollama registry
 * @param {string} model - Model name to pull
 * @param {string} ollamaHost - Ollama host string (e.g., '127.0.0.1:11435')
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Result object with ok and optional code
 */
async function pullModel(model, ollamaHost, onProgress) {
  const m = (model || '').toString().trim();
  if (!m) return { ok: false, reason: 'missing_model' };

  onProgress({ kind: 'stage', stage: 'pull-model', message: `Downloading model: ${m}` });
  const ollamaCmd = await resolveOllamaCommand();
  const p = spawnWithOutput('ollama', ['pull', m], { env: buildOllamaEnv(ollamaHost) }, onProgress);
  const code = await new Promise((resolve) => p.on('close', resolve));
  return { ok: code === 0, code };
}

module.exports = {
  listOllamaModels,
  hasOllamaModel,
  pullModel
};

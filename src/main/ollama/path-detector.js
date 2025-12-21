const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Ollama path detection utilities.
 * Handles finding Ollama binaries across different platforms.
 */

/**
 * Find Ollama executable on Windows
 * @returns {string|null} Path to ollama.exe or null if not found
 */
function findWindowsOllamaExe() {
  if (process.platform !== 'win32') return null;
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];

  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'));
    candidates.push(path.join(localAppData, 'Ollama', 'ollama.exe'));
  }
  if (programFiles) {
    candidates.push(path.join(programFiles, 'Ollama', 'ollama.exe'));
  }
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, 'Ollama', 'ollama.exe'));
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Get user-installed Ollama binary path (Linux/macOS)
 * @returns {string|null} Path to ollama binary or null if not found
 */
function getUserOllamaBinPath() {
  try {
    const p = path.join(os.homedir(), '.local', 'bin', 'ollama');
    if (fs.existsSync(p)) return p;
  } catch {
    // ignore
  }
  try {
    const p = path.join(os.homedir(), '.local', 'ollama', 'bin', 'ollama');
    if (fs.existsSync(p)) return p;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Resolve the Ollama command to use
 * @returns {Promise<string>} Path to Ollama binary or 'ollama' as fallback
 */
async function resolveOllamaCommand() {
  const userOllama = getUserOllamaBinPath();
  if (userOllama) return userOllama;
  const winOllama = findWindowsOllamaExe();
  if (winOllama) return winOllama;
  return 'ollama';
}

module.exports = {
  findWindowsOllamaExe,
  getUserOllamaBinPath,
  resolveOllamaCommand
};

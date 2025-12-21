const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * Process and system utilities.
 * Extracted from main.js to improve modularity.
 */

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build environment variables for spawning processes
 * @returns {object} Environment variables
 */
function buildSpawnEnv() {
  const env = { ...process.env };
  if (process.platform !== 'win32') {
    const userBin = path.join(os.homedir(), '.local', 'bin');
    env.PATH = env.PATH ? `${userBin}:${env.PATH}` : userBin;
  }
  return env;
}

/**
 * Build environment variables for Ollama processes
 * @param {string} ollamaHost - The Ollama host string (e.g., '127.0.0.1:11435')
 * @returns {object} Environment variables
 */
function buildOllamaEnv(ollamaHost) {
  const env = buildSpawnEnv();
  env.OLLAMA_HOST = ollamaHost;
  return env;
}

/**
 * Spawn a process with output streaming
 * @param {string} command - Command to execute
 * @param {Array<string>} args - Command arguments
 * @param {object} opts - Spawn options
 * @param {Function} onLog - Callback for log output (kind, stream, line)
 * @returns {ChildProcess} Child process
 */
function spawnWithOutput(command, args, opts = {}, onLog = null) {
  const child = spawn(command, args, {
    ...opts,
    env: opts.env || buildSpawnEnv(),
    windowsHide: true
  });

  if (onLog) {
    child.stdout?.on('data', (buf) => {
      const text = buf.toString('utf8');
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) onLog({ kind: 'log', stream: 'stdout', line });
      });
    });
    child.stderr?.on('data', (buf) => {
      const text = buf.toString('utf8');
      text.split(/\r?\n/).forEach((line) => {
        if (line.trim()) onLog({ kind: 'log', stream: 'stderr', line });
      });
    });
  }

  return child;
}

/**
 * Check if a command exists in the system PATH
 * @param {string} cmd - Command to check
 * @param {Function} getUserOllamaBinPath - Function to get user Ollama bin path
 * @param {Function} findWindowsOllamaExe - Function to find Windows Ollama exe
 * @returns {Promise<boolean>}
 */
async function hasCommand(cmd, getUserOllamaBinPath = null, findWindowsOllamaExe = null) {
  if (cmd === 'ollama') {
    if (getUserOllamaBinPath) {
      const userOllama = getUserOllamaBinPath();
      if (userOllama) return true;
    }
    if (findWindowsOllamaExe) {
      const winOllama = findWindowsOllamaExe();
      if (winOllama) return true;
    }
  }
  const checker = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    const p = spawn(checker, [cmd], { windowsHide: true, env: buildSpawnEnv() });
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

module.exports = {
  sleep,
  buildSpawnEnv,
  buildOllamaEnv,
  spawnWithOutput,
  hasCommand
};

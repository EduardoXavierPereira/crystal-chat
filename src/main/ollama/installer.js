const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnWithOutput, hasCommand } = require('../utils/process-utils');
const { findWindowsOllamaExe } = require('./path-detector');

/**
 * Ollama installation utilities.
 * Handles installing Ollama across different platforms.
 */

/**
 * Install Ollama on Windows using winget or chocolatey
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Installation result
 */
async function installOnWindows(onProgress) {
  const hasWinget = await hasCommand('winget');
  if (hasWinget) {
    onProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama via winget...' });
    const p = spawnWithOutput(
      'winget',
      [
        'install',
        '--exact',
        '--id',
        'Ollama.Ollama',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity'
      ],
      {},
      onProgress
    );
    const code = await new Promise((resolve) => p.on('close', resolve));
    const ok = code === 0 && (await hasCommand('ollama'));
    if (!ok) {
      const found = findWindowsOllamaExe();
      if (found) {
        onProgress({ kind: 'log', stream: 'stdout', line: `Found ollama.exe at: ${found}` });
        return { ok: true, code, method: 'winget', path: found };
      }
    }
    return { ok, code, method: 'winget' };
  }

  const hasChoco = await hasCommand('choco');
  if (hasChoco) {
    onProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama via chocolatey...' });
    const p = spawnWithOutput('choco', ['install', 'ollama', '-y'], {}, onProgress);
    const code = await new Promise((resolve) => p.on('close', resolve));
    const ok = code === 0 && (await hasCommand('ollama'));
    if (!ok) {
      const found = findWindowsOllamaExe();
      if (found) {
        onProgress({ kind: 'log', stream: 'stdout', line: `Found ollama.exe at: ${found}` });
        return { ok: true, code, method: 'choco', path: found };
      }
    }
    return { ok, code, method: 'choco' };
  }

  onProgress({
    kind: 'error',
    stage: 'install',
    message: 'Could not auto-install Ollama (winget/choco not found). Please install Ollama from https://ollama.com/download/windows then click Retry.'
  });
  return { ok: false, reason: 'no_installer_found' };
}

/**
 * Install Ollama on Linux (user-level install, no sudo)
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Installation result
 */
async function installOnLinux(onProgress) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const installDir = path.join(os.homedir(), '.local', 'ollama');
  const binDir = path.join(os.homedir(), '.local', 'bin');
  const url = `https://ollama.com/download/ollama-linux-${arch}.tgz`;

  onProgress({
    kind: 'stage',
    stage: 'install',
    message: `Installing Ollama to ${binDir} (no sudo)...`
  });

  const cmd = [
    `mkdir -p "${installDir}"`,
    `mkdir -p "${binDir}"`,
    `echo ">>> Downloading ${url}"`,
    `curl --fail --show-error --location --progress-bar "${url}" | tar -xzf - -C "${installDir}"`,
    `OLLAMA_SRC=""`,
    `[ -x "${path.join(installDir, 'bin', 'ollama')}" ] && OLLAMA_SRC="${path.join(installDir, 'bin', 'ollama')}" || true`,
    `[ -z "$OLLAMA_SRC" ] && OLLAMA_SRC=$(find "${installDir}" -type f -name ollama -perm -u+x 2>/dev/null | head -n 1) || true`,
    `if [ -z "$OLLAMA_SRC" ]; then echo "ERROR: could not locate extracted ollama binary"; exit 1; fi`,
    `echo ">>> Linking $OLLAMA_SRC to ${path.join(binDir, 'ollama')}"`,
    `ln -sf "$OLLAMA_SRC" "${path.join(binDir, 'ollama')}"`,
    `"${path.join(binDir, 'ollama')}" --version || true`
  ].join(' && ');

  const p = spawnWithOutput('bash', ['-lc', cmd], {}, onProgress);
  const code = await new Promise((resolve) => p.on('close', resolve));
  const ok = code === 0 && fs.existsSync(path.join(binDir, 'ollama'));
  return { ok, code, installDir, binDir };
}

/**
 * Install Ollama on macOS using Homebrew or official install script
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Installation result
 */
async function installOnMacOS(onProgress) {
  const hasBrew = await hasCommand('brew');
  if (hasBrew) {
    const p = spawnWithOutput('brew', ['install', 'ollama'], {}, onProgress);
    const code = await new Promise((resolve) => p.on('close', resolve));
    return { ok: code === 0, code };
  }

  // Fallback to official install script
  const p = spawnWithOutput('bash', ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh'], {}, onProgress);
  const code = await new Promise((resolve) => p.on('close', resolve));
  return { ok: code === 0, code };
}

/**
 * Install Ollama (best effort based on platform)
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<object>} Installation result
 */
async function installOllamaBestEffort(onProgress) {
  if (await hasCommand('ollama')) {
    return { ok: true, already: true };
  }

  onProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama...' });

  if (process.platform === 'win32') {
    return await installOnWindows(onProgress);
  }

  if (process.platform === 'linux') {
    return await installOnLinux(onProgress);
  }

  if (process.platform === 'darwin') {
    return await installOnMacOS(onProgress);
  }

  return { ok: false, reason: 'unsupported_platform' };
}

module.exports = {
  installOllamaBestEffort,
  installOnWindows,
  installOnLinux,
  installOnMacOS
};

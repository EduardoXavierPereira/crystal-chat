const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

const OLLAMA_HOST = '127.0.0.1:11435';
const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}`;

let mainWindow = null;
let ollamaServeProc = null;

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

function buildSpawnEnv() {
  const env = { ...process.env };
  if (process.platform !== 'win32') {
    const userBin = path.join(os.homedir(), '.local', 'bin');
    env.PATH = env.PATH ? `${userBin}:${env.PATH}` : userBin;
  }
  return env;
}

function buildOllamaEnv() {
  const env = buildSpawnEnv();
  // Force Ollama CLI + server to use our dedicated port.
  env.OLLAMA_HOST = OLLAMA_HOST;
  return env;
}

function sendSetupProgress(payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ollama:setup-progress', payload);
    }
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpJson(url, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode || 0}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function httpPostJson(url, body, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const u = new URL(url);
    const req = http.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw || '{}'));
            } catch (e) {
              reject(e);
            }
          } else {
            const err = new Error(`HTTP ${res.statusCode || 0}`);
            err.body = raw;
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function isOllamaServerReachable() {
  try {
    await httpJson(`${OLLAMA_BASE_URL}/api/version`, { timeoutMs: 1200 });
    return true;
  } catch {
    return false;
  }
}

function spawnWithOutput(command, args, opts = {}) {
  const child = spawn(command, args, {
    ...opts,
    env: opts.env || buildSpawnEnv(),
    windowsHide: true
  });

  child.stdout?.on('data', (buf) => {
    const text = buf.toString('utf8');
    text.split(/\r?\n/).forEach((line) => {
      if (line.trim()) sendSetupProgress({ kind: 'log', stream: 'stdout', line });
    });
  });
  child.stderr?.on('data', (buf) => {
    const text = buf.toString('utf8');
    text.split(/\r?\n/).forEach((line) => {
      if (line.trim()) sendSetupProgress({ kind: 'log', stream: 'stderr', line });
    });
  });

  return child;
}

async function hasCommand(cmd) {
  if (cmd === 'ollama') {
    const userOllama = getUserOllamaBinPath();
    if (userOllama) return true;
    const winOllama = findWindowsOllamaExe();
    if (winOllama) return true;
  }
  const checker = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    const p = spawn(checker, [cmd], { windowsHide: true, env: buildSpawnEnv() });
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

async function resolveOllamaCommand() {
  const userOllama = getUserOllamaBinPath();
  if (userOllama) return userOllama;
  const winOllama = findWindowsOllamaExe();
  if (winOllama) return winOllama;
  return 'ollama';
}

async function listOllamaModels() {
  const json = await httpJson(`${OLLAMA_BASE_URL}/api/tags`, { timeoutMs: 2500 });
  const models = Array.isArray(json?.models) ? json.models : [];
  return models.map((m) => (m && m.name ? String(m.name) : '')).filter(Boolean);
}

async function hasOllamaModel(model) {
  const name = (model || '').toString().trim();
  if (!name) return false;
  if (!(await isOllamaServerReachable())) return false;
  try {
    // /api/show returns 200 when the model exists locally.
    await httpPostJson(`${OLLAMA_BASE_URL}/api/show`, { name }, { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureOllamaServer() {
  if (await isOllamaServerReachable()) return { ok: true };

  const hasBin = await hasCommand('ollama');
  if (!hasBin) return { ok: false, reason: 'missing_binary' };

  if (ollamaServeProc && !ollamaServeProc.killed) {
    // already started by us; give it another moment
  } else {
    sendSetupProgress({ kind: 'stage', stage: 'start-server', message: 'Starting Ollama server...' });

    try {
      const ollamaCmd = await resolveOllamaCommand();
      ollamaServeProc = spawn(ollamaCmd, ['serve'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildOllamaEnv(),
        windowsHide: true
      });
      ollamaServeProc.unref();
      ollamaServeProc.on('error', (e) => {
        sendSetupProgress({ kind: 'error', stage: 'start-server', message: e.message || String(e) });
      });
      ollamaServeProc.stdout?.on('data', () => {});
      ollamaServeProc.stderr?.on('data', () => {});
    } catch (e) {
      return { ok: false, reason: 'failed_to_spawn', error: e?.message || String(e) };
    }
  }

  for (let i = 0; i < 20; i++) {
    if (await isOllamaServerReachable()) return { ok: true };
    await sleep(500);
  }
  return { ok: false, reason: 'server_unreachable' };
}

async function installOllamaBestEffort() {
  if (await hasCommand('ollama')) return { ok: true, already: true };

  sendSetupProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama...' });

  if (process.platform === 'win32') {
    // Prefer winget, fall back to chocolatey. If neither exists, instruct manual install.
    const hasWinget = await hasCommand('winget');
    if (hasWinget) {
      sendSetupProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama via winget...' });
      const p = spawnWithOutput('winget', ['install', '--exact', '--id', 'Ollama.Ollama', '--silent']);
      const code = await new Promise((resolve) => p.on('close', resolve));
      const ok = code === 0 && (await hasCommand('ollama'));
      if (!ok) {
        const found = findWindowsOllamaExe();
        if (found) {
          sendSetupProgress({ kind: 'log', stream: 'stdout', line: `Found ollama.exe at: ${found}` });
          return { ok: true, code, method: 'winget', path: found };
        }
      }
      return { ok, code, method: 'winget' };
    }

    const hasChoco = await hasCommand('choco');
    if (hasChoco) {
      sendSetupProgress({ kind: 'stage', stage: 'install', message: 'Installing Ollama via chocolatey...' });
      const p = spawnWithOutput('choco', ['install', 'ollama', '-y']);
      const code = await new Promise((resolve) => p.on('close', resolve));
      const ok = code === 0 && (await hasCommand('ollama'));
      if (!ok) {
        const found = findWindowsOllamaExe();
        if (found) {
          sendSetupProgress({ kind: 'log', stream: 'stdout', line: `Found ollama.exe at: ${found}` });
          return { ok: true, code, method: 'choco', path: found };
        }
      }
      return { ok, code, method: 'choco' };
    }

    sendSetupProgress({
      kind: 'error',
      stage: 'install',
      message: 'Could not auto-install Ollama (winget/choco not found). Please install Ollama from https://ollama.com/download/windows then click Retry.'
    });
    return { ok: false, reason: 'no_installer_found' };
  }

  if (process.platform === 'darwin') {
    const hasBrew = await hasCommand('brew');
    if (hasBrew) {
      const p = spawnWithOutput('brew', ['install', 'ollama']);
      const code = await new Promise((resolve) => p.on('close', resolve));
      return { ok: code === 0, code };
    }
  }

  if (process.platform === 'linux') {
    // User-level install to avoid sudo prompts.
    // Source bundle URLs: https://ollama.com/download/ollama-linux-amd64.tgz
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const installDir = path.join(os.homedir(), '.local', 'ollama');
    const binDir = path.join(os.homedir(), '.local', 'bin');
    const url = `https://ollama.com/download/ollama-linux-${arch}.tgz`;

    sendSetupProgress({
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

    const p = spawnWithOutput('bash', ['-lc', cmd]);
    const code = await new Promise((resolve) => p.on('close', resolve));
    const ok = code === 0 && fs.existsSync(path.join(binDir, 'ollama'));
    return { ok, code, installDir, binDir };
  }

  if (process.platform === 'darwin') {
    const p = spawnWithOutput('bash', ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh']);
    const code = await new Promise((resolve) => p.on('close', resolve));
    return { ok: code === 0, code };
  }

  return { ok: false, reason: 'unsupported_platform' };
}

async function pullModel(model) {
  const m = (model || '').toString().trim();
  if (!m) return { ok: false, reason: 'missing_model' };

  sendSetupProgress({ kind: 'stage', stage: 'pull-model', message: `Downloading model: ${m}` });
  const ollamaCmd = await resolveOllamaCommand();
  const p = spawnWithOutput(ollamaCmd, ['pull', m], { env: buildOllamaEnv() });
  const code = await new Promise((resolve) => p.on('close', resolve));
  return { ok: code === 0, code };
}

app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar,OverlayScrollbars');
app.commandLine.appendSwitch('disable-overlay-scrollbar');

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

  win.loadFile('renderer/index.html');
  win.maximize();

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();

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
  if (ollamaServeProc) ollamaServeProc.kill();
});

// IPC for Ollama config passthrough if needed later
ipcMain.handle('ping', () => 'pong');

ipcMain.handle('ollama:getApiUrl', async () => {
  return { apiUrl: `${OLLAMA_BASE_URL}/api/chat`, baseUrl: OLLAMA_BASE_URL, host: OLLAMA_HOST };
});

ipcMain.handle('ollama:check', async () => {
  const hasBinary = await hasCommand('ollama');
  const serverReachable = await isOllamaServerReachable();
  let models = [];
  if (serverReachable) {
    try {
      models = await listOllamaModels();
    } catch {
      models = [];
    }
  }
  return {
    hasBinary,
    serverReachable,
    models,
    hasQwen3_4b: await hasOllamaModel('qwen3:4b')
  };
});

ipcMain.handle('ollama:hasModel', async (_evt, { model }) => {
  const ok = await hasOllamaModel(model);
  return { ok };
});

ipcMain.handle('ollama:ensureServer', async () => {
  const res = await ensureOllamaServer();
  return res;
});

ipcMain.handle('ollama:install', async () => {
  const res = await installOllamaBestEffort();
  sendSetupProgress({
    kind: res.ok ? 'done' : 'error',
    stage: 'install',
    message: res.ok ? 'Ollama installed.' : 'Ollama install failed.'
  });
  return res;
});

ipcMain.handle('ollama:pullModel', async (_evt, { model }) => {
  const server = await ensureOllamaServer();
  if (!server.ok) {
    return { ok: false, reason: 'server_not_ready', server };
  }
  const res = await pullModel(model);
  sendSetupProgress({
    kind: res.ok ? 'done' : 'error',
    stage: 'pull-model',
    message: res.ok ? 'Model ready.' : 'Model download failed.'
  });
  return res;
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  restartAndUpdate: () => ipcRenderer.invoke('updater:restartAndUpdate'),
  ollamaCheck: () => ipcRenderer.invoke('ollama:check'),
  ollamaEnsureServer: () => ipcRenderer.invoke('ollama:ensureServer'),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  ollamaHasModel: (model) => ipcRenderer.invoke('ollama:hasModel', { model }),
  ollamaPullModel: (model) => ipcRenderer.invoke('ollama:pullModel', { model }),
  ollamaGetApiUrl: () => ipcRenderer.invoke('ollama:getApiUrl'),
  readLocalFile: (path) => ipcRenderer.invoke('tools:readLocalFile', { path }),
  webSearch: (query) => ipcRenderer.invoke('tools:webSearch', { query }),
  openLink: (url) => ipcRenderer.invoke('tools:openLink', { url }),
  // File system tools
  fileRead: (path, offset, limit) => ipcRenderer.invoke('tools:fileRead', { path, offset, limit }),
  fileWrite: (path, content) => ipcRenderer.invoke('tools:fileWrite', { path, content }),
  fileEdit: (path, old_string, new_string, replace_all) => ipcRenderer.invoke('tools:fileEdit', { path, old_string, new_string, replace_all }),
  fileGlob: (pattern, path) => ipcRenderer.invoke('tools:fileGlob', { pattern, path }),
  fileGrep: (pattern, path, options) => ipcRenderer.invoke('tools:fileGrep', { pattern, path, ...options }),
  folderBrowse: (path, recursive) => ipcRenderer.invoke('tools:folderBrowse', { path, recursive }),
  onUpdateAvailable: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:update-available', listener);
    return () => ipcRenderer.removeListener('updater:update-available', listener);
  },
  onUpdateDownloaded: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:update-downloaded', listener);
    return () => ipcRenderer.removeListener('updater:update-downloaded', listener);
  },
  onUpdateProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:download-progress', listener);
    return () => ipcRenderer.removeListener('updater:download-progress', listener);
  },
  onUpdateError: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:error', listener);
    return () => ipcRenderer.removeListener('updater:error', listener);
  },
  onOllamaSetupProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:setup-progress', listener);
    return () => ipcRenderer.removeListener('ollama:setup-progress', listener);
  }
});

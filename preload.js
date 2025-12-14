const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  ollamaCheck: () => ipcRenderer.invoke('ollama:check'),
  ollamaEnsureServer: () => ipcRenderer.invoke('ollama:ensureServer'),
  ollamaInstall: () => ipcRenderer.invoke('ollama:install'),
  ollamaHasModel: (model) => ipcRenderer.invoke('ollama:hasModel', { model }),
  ollamaPullModel: (model) => ipcRenderer.invoke('ollama:pullModel', { model }),
  ollamaGetApiUrl: () => ipcRenderer.invoke('ollama:getApiUrl'),
  onOllamaSetupProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ollama:setup-progress', listener);
    return () => ipcRenderer.removeListener('ollama:setup-progress', listener);
  }
});

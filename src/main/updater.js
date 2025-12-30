const { ipcMain } = require('electron');
const { CustomUpdater } = require('./custom-updater');

/**
 * Auto-updater setup and handlers.
 * Manages application updates using a self-hosted update server.
 */

let autoUpdater = null;
function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = new CustomUpdater();
  }
  return autoUpdater;
}

/**
 * Setup auto-updater with event handlers
 * @param {object} app - Electron app instance
 * @param {Function} sendUpdaterEvent - Function to send events to renderer
 * @param {object} state - Shared state object (contains updateAvailableInfo)
 * @param {string} updateServerUrl - URL to custom update server
 */
function setupAutoUpdater(app, sendUpdaterEvent, state, updateServerUrl) {
  // Avoid running updater in dev
  if (!app.isPackaged) return;

  const updater = getAutoUpdater();
  if (updateServerUrl) {
    updater.updateServerUrl = updateServerUrl;
  }

  // Keep behavior explicit: we only download/install after user approves
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  updater.on('error', (err) => {
    sendUpdaterEvent('updater:error', { message: err?.message || String(err) });
  });

  updater.on('update-available', (info) => {
    state.updateAvailableInfo = info || null;
    sendUpdaterEvent('updater:update-available', {
      version: info?.version || null,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null
    });
  });

  updater.on('update-not-available', () => {
    state.updateAvailableInfo = null;
  });

  updater.on('download-progress', (progress) => {
    sendUpdaterEvent('updater:download-progress', {
      percent: progress?.percent,
      bytesPerSecond: progress?.bytesPerSecond,
      transferred: progress?.transferred,
      total: progress?.total
    });
  });

  updater.on('update-downloaded', (info) => {
    sendUpdaterEvent('updater:update-downloaded', {
      version: info?.version || null,
      releaseName: info?.releaseName || null
    });
  });

  // Check shortly after launch
  setTimeout(() => {
    updater.checkForUpdates().catch(() => {
      // ignore
    });
  }, 900);
}

/**
 * Register updater IPC handlers
 * @param {object} app - Electron app instance
 * @param {object} state - Shared state object (contains updateAvailableInfo)
 */
function registerUpdaterHandlers(app, state) {
  ipcMain.handle('updater:restartAndUpdate', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
    try {
      const updater = getAutoUpdater();
      // If an update is available but not downloaded, download now
      if (state.updateAvailableInfo) {
        try {
          const downloadPath = await updater.downloadUpdate(state.updateAvailableInfo.updateInfo);
          // Store path for installation
          state.downloadedUpdatePath = downloadPath;
        } catch (downloadError) {
          return { ok: false, reason: 'download_failed', error: downloadError?.message };
        }
      }
      // quitAndInstall will run once the update is downloaded
      updater.quitAndInstall(false, true);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'failed', error: e?.message || String(e) };
    }
  });
}

module.exports = {
  setupAutoUpdater,
  registerUpdaterHandlers
};

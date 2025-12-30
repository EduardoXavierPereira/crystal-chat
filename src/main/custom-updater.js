/**
 * Custom self-hosted update checker
 * Replaces electron-updater's GitHub integration with a custom server endpoint
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { EventEmitter } = require('events');

class CustomUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = false;
    this.updateServerUrl = process.env.UPDATE_SERVER_URL || 'http://localhost:3000/api/updates';
    this.currentVersion = app.getVersion();
  }

  /**
   * Check for updates by hitting custom server
   * Expected response: { version, url, releaseNotes, signature }
   */
  async checkForUpdates() {
    try {
      const updateInfo = await this._fetchUpdateInfo();

      if (!updateInfo) {
        this.emit('update-not-available');
        return null;
      }

      // Check if server version is newer than current
      if (this._isNewerVersion(updateInfo.version)) {
        this.emit('update-available', {
          version: updateInfo.version,
          releaseName: updateInfo.releaseName || `v${updateInfo.version}`,
          releaseNotes: updateInfo.releaseNotes || '',
          updateInfo // Store full info for later download
        });
        return updateInfo;
      } else {
        this.emit('update-not-available');
        return null;
      }
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Download the update file
   * @param {object} updateInfo - Info returned from checkForUpdates
   */
  async downloadUpdate(updateInfo) {
    if (!updateInfo || !updateInfo.url) {
      throw new Error('Invalid update info: missing download URL');
    }

    return new Promise((resolve, reject) => {
      const downloadPath = path.join(
        app.getPath('userData'),
        `crystal-chat-update-${updateInfo.version}.exe`
      );

      const protocol = updateInfo.url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(downloadPath);
      let totalSize = 0;
      let downloadedSize = 0;

      protocol.get(updateInfo.url, (response) => {
        if (response.statusCode !== 200) {
          fs.unlink(downloadPath, () => {});
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        totalSize = parseInt(response.headers['content-length'] || 0, 10);
        let lastEmitTime = Date.now();

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;

          // Emit progress every 100ms to avoid flooding
          const now = Date.now();
          if (now - lastEmitTime > 100) {
            const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
            this.emit('download-progress', {
              percent,
              bytesPerSecond: downloadedSize / ((now - Date.now()) / 1000 || 1),
              transferred: downloadedSize,
              total: totalSize
            });
            lastEmitTime = now;
          }
        });

        response.pipe(file);
      }).on('error', (err) => {
        fs.unlink(downloadPath, () => {});
        reject(err);
      });

      file.on('finish', () => {
        file.close();
        this.emit('update-downloaded', {
          version: updateInfo.version,
          releaseName: updateInfo.releaseName,
          filePath: downloadPath
        });
        resolve(downloadPath);
      }).on('error', (err) => {
        fs.unlink(downloadPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Install update and restart
   * @param {string} filePath - Path to downloaded installer
   */
  async quitAndInstall(isSilent = false, isForceRunAfter = true) {
    try {
      const { spawn } = require('child_process');

      // On Windows, NSIS installer handles the installation
      spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      app.quit();
    } catch (error) {
      throw new Error(`Failed to install update: ${error.message}`);
    }
  }

  /**
   * Fetch update info from server
   * @private
   */
  async _fetchUpdateInfo() {
    return new Promise((resolve, reject) => {
      const protocol = this.updateServerUrl.startsWith('https') ? https : http;

      protocol.get(this.updateServerUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Server returned ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const updateInfo = JSON.parse(data);
            resolve(updateInfo);
          } catch (error) {
            reject(new Error('Invalid JSON from server'));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Compare versions (simple semver check)
   * @private
   */
  _isNewerVersion(serverVersion) {
    const parseVersion = (v) => {
      const parts = v.split('.').map(Number);
      return parts;
    };

    const current = parseVersion(this.currentVersion);
    const server = parseVersion(serverVersion);

    for (let i = 0; i < Math.max(current.length, server.length); i++) {
      const curr = current[i] || 0;
      const serv = server[i] || 0;
      if (serv > curr) return true;
      if (serv < curr) return false;
    }
    return false;
  }
}

module.exports = { CustomUpdater };

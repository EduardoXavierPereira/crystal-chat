const { ipcMain } = require('electron');
const { webSearch } = require('../tools/web-search');
const { openLink, readLocalFile } = require('../tools/web-fetch');
const { fileRead, fileWrite, fileEdit, fileGlob, fileGrep, folderBrowse } = require('../tools/file-system');

/**
 * Tools IPC handlers.
 * Handles all tool-related IPC communication between renderer and main process.
 */

/**
 * Register tools IPC handlers
 */
function registerToolsHandlers() {
  // Web search
  ipcMain.handle('tools:webSearch', async (_evt, { query }) => {
    return await webSearch(query);
  });

  // Web fetch
  ipcMain.handle('tools:openLink', async (_evt, { url }) => {
    return await openLink(url);
  });

  ipcMain.handle('tools:readLocalFile', async (_evt, { path }) => {
    return await readLocalFile(path);
  });

  // File system tools
  ipcMain.handle('tools:fileRead', async (_evt, { path, offset, limit }) => {
    return fileRead(path, offset, limit);
  });

  ipcMain.handle('tools:fileWrite', async (_evt, { path, content }) => {
    return fileWrite(path, content);
  });

  ipcMain.handle('tools:fileEdit', async (_evt, { path, old_string, new_string, replace_all }) => {
    return fileEdit(path, old_string, new_string, replace_all);
  });

  ipcMain.handle('tools:fileGlob', async (_evt, { pattern, path }) => {
    return fileGlob(pattern, path);
  });

  ipcMain.handle('tools:fileGrep', async (_evt, { pattern, path, glob, type, output_mode, head_limit }) => {
    return fileGrep(pattern, path, glob, type, output_mode, head_limit);
  });

  ipcMain.handle('tools:folderBrowse', async (_evt, { path, recursive }) => {
    return folderBrowse(path, recursive);
  });
}

module.exports = {
  registerToolsHandlers
};

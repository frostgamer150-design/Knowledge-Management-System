const { startFileWatch, stopFileWatch } = require('./file_watcher.cjs');

function startVaultWatch(vaultPath, mainWindow) {
  if (vaultPath) {
    startFileWatch(vaultPath, mainWindow);
  }
}

function handleVaultChange(newVaultPath, mainWindow) {
  stopFileWatch();
  if (newVaultPath) {
    startFileWatch(newVaultPath, mainWindow);
  }
  mainWindow?.webContents.send('vault-changed', { path: newVaultPath });
}

module.exports = { startVaultWatch, handleVaultChange };

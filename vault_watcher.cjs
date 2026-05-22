const { startFileWatch, stopFileWatch } = require('./file_watcher.cjs');

function startVaultWatch(vaultPath, mainWindow) {
  startFileWatch(vaultPath, mainWindow);
}

function handleVaultChange(newVaultPath, mainWindow) {
  stopFileWatch();
  startFileWatch(newVaultPath, mainWindow);
  mainWindow?.webContents.send('vault-changed', { path: newVaultPath });
}

module.exports = { startVaultWatch, handleVaultChange };

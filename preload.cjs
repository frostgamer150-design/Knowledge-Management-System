const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Vault Config Store operations
  getVaultInfo: () => ipcRenderer.invoke('get-vault-info'),
  selectVaultDir: () => ipcRenderer.invoke('select-vault-dir'),
  setVaultPath: (path) => ipcRenderer.invoke('set-vault-path', path),
  clearVault: () => ipcRenderer.invoke('clear-vault'),

  // Vault File operations
  getVaultTree: () => ipcRenderer.invoke('get-vault-tree'),
  createFile: (relativePath, content) => ipcRenderer.invoke('create-file', relativePath, content),
  createFolder: (relativePath) => ipcRenderer.invoke('create-folder', relativePath),
  readFile: (relativePath) => ipcRenderer.invoke('read-file', relativePath),
  writeFile: (relativePath, content) => ipcRenderer.invoke('write-file', relativePath, content),
  moveItem: (oldRelativePath, newRelativePath) => ipcRenderer.invoke('move-item', oldRelativePath, newRelativePath),
  deleteItem: (relativePath) => ipcRenderer.invoke('delete-item', relativePath),

  // SQLite DB Cache operations
  sqliteGetFileStats: () => ipcRenderer.invoke('sqlite-get-file-stats'),
  sqliteLoadCache: () => ipcRenderer.invoke('sqlite-load-cache'),
  sqliteSaveDocument: (doc, mtimeMs, size) => ipcRenderer.invoke('sqlite-save-document', doc, mtimeMs, size),
  sqliteDeleteDocument: (path) => ipcRenderer.invoke('sqlite-delete-document', path),
  sqliteGetSingleFileStat: (path) => ipcRenderer.invoke('sqlite-get-single-file-stat', path),
  sqliteSearchNotes: (queryText) => ipcRenderer.invoke('sqlite-search-notes', queryText),

  // File & vault watchers
  startFileWatch: (vaultPath) => ipcRenderer.invoke('on-file-folder-watch', vaultPath),
  onVaultTreeChanged: (callback) => ipcRenderer.on('vault-tree-changed', (_e, payload) => callback(payload)),
  onVaultChanged: (callback) => ipcRenderer.on('vault-changed', (_e, payload) => callback(payload)),
  offVaultTreeChanged: () => ipcRenderer.removeAllListeners('vault-tree-changed'),
  offVaultChanged: () => ipcRenderer.removeAllListeners('vault-changed'),
});

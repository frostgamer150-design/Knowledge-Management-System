const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { startVaultWatch, handleVaultChange } = require('./vault_watcher.cjs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;

// SetUp Electron Store
// Lightweight wrapper simulating electron-store to save JSON config in AppData
class ElectronStore {
  constructor(configName = 'vault_info') {
    const userDataPath = app.getPath('userData');
    this.path = path.join(userDataPath, configName + '.json');
    this.data = this.parseDataFile(this.path);
  }

  get(key) {
    return this.data[key];
  }

  set(key, val) {
    this.data[key] = val;
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save config in AppData:', err);
    }
  }

  parseDataFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (err) {
      // Ignored
    }
    return {};
  }
}

const store = new ElectronStore();

// Load the dynamic vaultPath from AppData store, fallback to default local folder
let vaultPath = store.get('vaultPath') || path.join(__dirname, 'vault');

// Helper to ensure path exists and populate it with initial welcome files if it is a new folder
function ensureVaultExists(vPath) {
  if (!fs.existsSync(vPath)) {
    fs.mkdirSync(vPath, { recursive: true });
    fs.writeFileSync(path.join(vPath, 'README.md'), '# Welcome to Vault Workspace 🚀\n\nThis is a markdown notes editor.');

    fs.mkdirSync(path.join(vPath, 'Projects'), { recursive: true });
    fs.writeFileSync(path.join(vPath, 'Projects', 'system-design.md'), '# System Design\n\nArchitecture details.');
    fs.writeFileSync(path.join(vPath, 'Projects', 'knowledge-engine.md'), '# Knowledge Engine\n\nCore logic for mapping links.');

    fs.mkdirSync(path.join(vPath, 'Daily Notes'), { recursive: true });
    fs.writeFileSync(path.join(vPath, 'Daily Notes', '2026-05-20.md'), '# Daily Note: 2026-05-20\n\nTasks of the day.');
  }
}

ensureVaultExists(vaultPath);

/** @typedef {import('./src/types').ExplorerNode} ExplorerNode */
/** @typedef {import('./src/types').FolderNode} FolderNode */
/** @typedef {import('./src/types').FileNode} FileNode */

/**
 * Recursively reads directory contents to build an ExplorerNode tree.
 * @param {string} dirPath - Absolute path of the directory
 * @param {string} [relativeDir] - Relative directory path from vault root
 * @returns {ExplorerNode[]} Array of ExplorerNode representing files and folders
 */
function readDirectoryRecursive(dirPath, relativeDir = '') {
  const result = [];
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fileRelativePath = relativeDir ? path.join(relativeDir, file.name) : file.name;
    const fileAbsolutePath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      result.push({
        name: file.name,
        path: fileRelativePath.replace(/\\/g, '/'),
        isFolder: true,
        children: readDirectoryRecursive(fileAbsolutePath, fileRelativePath),
      });
    } else {
      result.push({
        name: file.name,
        path: fileRelativePath.replace(/\\/g, '/'),
        isFolder: false,
      });
    }
  }

  // Sort folders first, then files alphabetically
  return result.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Create the window (Main Stuff)
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Turn off native frame to use our custom draggable header
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    startVaultWatch(vaultPath, mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 0. IPC Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// 1. Vault Config Flow (Luồng)
// IPC Vault Config & Dir selector
ipcMain.handle('get-vault-info', () => {
  return {
    vaultPath,
    lastOpened: store.get('lastOpened') || new Date().toISOString(),
    name: store.get('name') || path.basename(vaultPath) || 'My Vault',
  };
});

ipcMain.handle('select-vault-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Vault Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  vaultPath = selectedPath;
  store.set('vaultPath', selectedPath);
  store.set('lastOpened', new Date().toISOString());
  store.set('name', path.basename(selectedPath));
  ensureVaultExists(selectedPath);
  handleVaultChange(selectedPath, mainWindow);
  return selectedPath;
});

ipcMain.handle('set-vault-path', (event, newPath) => {
  vaultPath = newPath;
  store.set('vaultPath', newPath);
  store.set('lastOpened', new Date().toISOString());
  store.set('name', path.basename(newPath));
  ensureVaultExists(newPath);
  handleVaultChange(newPath, mainWindow);
  return true;
});

// IPC Vault File operations
ipcMain.handle('get-vault-tree', () => {
  try {
    return readDirectoryRecursive(vaultPath);
  } catch (err) {
    console.error(err);
    return [];
  }
});


// 2. File Operations (Thao tác với file)
ipcMain.handle('create-file', (event, relativePath, content = '') => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    const parentDir = path.dirname(absolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(absolutePath, content);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
});

ipcMain.handle('create-folder', (event, relativePath) => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    fs.mkdirSync(absolutePath, { recursive: true });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
});

ipcMain.handle('read-file', (event, relativePath) => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath, 'utf-8');
    }
    return '';
  } catch (err) {
    console.error(err);
    return '';
  }
});

ipcMain.handle('write-file', (event, relativePath, content) => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    fs.writeFileSync(absolutePath, content);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
});

ipcMain.handle('move-item', (event, oldRelativePath, newRelativePath) => {
  try {
    const oldAbsolutePath = path.join(vaultPath, oldRelativePath);
    const newAbsolutePath = path.join(vaultPath, newRelativePath);

    if (!fs.existsSync(oldAbsolutePath)) {
      return { success: false, error: 'Source file does not exist' };
    }

    // Ensure parent directory of target path exists
    const parentDir = path.dirname(newAbsolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Xử lý trùng tên
    let finalDestPath = newAbsolutePath;
    if (fs.existsSync(newAbsolutePath)) {
      const ext = path.extname(newAbsolutePath);
      const base = path.basename(newAbsolutePath, ext);
      const dir = path.dirname(newAbsolutePath);
      let counter = 1;
      while (fs.existsSync(path.join(dir, `${base} (${counter})${ext}`))) {
        counter++;
      }
      finalDestPath = path.join(dir, `${base} (${counter})${ext}`);
    }

    fs.renameSync(oldAbsolutePath, finalDestPath);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

// 3. Watch Vault
// on-file-folder-watch: renderer can re-trigger watching (e.g. after manual reload)
ipcMain.handle('on-file-folder-watch', (_event, newVaultPath) => {
  const target = newVaultPath || vaultPath;
  startVaultWatch(target, mainWindow);
  return true;
});

// vault-change: restart the watcher when the active vault path switches
ipcMain.handle('vault-change', (_event, newVaultPath) => {
  vaultPath = newVaultPath;
  handleVaultChange(newVaultPath, mainWindow);
  return true;
});

ipcMain.handle('delete-item', (event, relativePath) => {
  try {
    const absolutePath = path.join(vaultPath, relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: 'File/Folder does not exist' };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});
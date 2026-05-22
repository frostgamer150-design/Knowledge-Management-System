const chokidar = require('chokidar');
const path = require('path');

let watcher = null;

// Định nghĩa cấu trúc dữ liệu payload cho sự kiện thay đổi file/folder (FilePayload)

function startFileWatch(vaultPath, mainWindow) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  });

  const send = (payload) => mainWindow?.webContents.send('vault-tree-changed', payload);

  const rel = (absPath) => path.relative(vaultPath, absPath).replace(/\\/g, '/');

  watcher
    .on('add', (absPath) => {
      send({ event: 'create', type: 'file', path: rel(absPath) });
    })
    .on('addDir', (absPath) => {
      const relative = rel(absPath);
      if (relative) send({ event: 'create', type: 'folder', path: relative });
    })
    .on('change', (absPath) => {
      send({ event: 'modify', type: 'file', path: rel(absPath) });
    })
    .on('unlink', (absPath) => {
      send({ event: 'delete', type: 'file', path: rel(absPath) });
    })
    .on('unlinkDir', (absPath) => {
      const relative = rel(absPath);
      if (relative) send({ event: 'delete', type: 'folder', path: relative });
    });
}

function stopFileWatch() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

module.exports = { startFileWatch, stopFileWatch };

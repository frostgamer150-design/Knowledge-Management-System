![[Tóm tắt mục tiêu và deliverables phase 1]]
# P1 — Vault & File System

### 1. Luồng Tạo File Mới (File Creation Flow)

* **React State** quản lý giao diện tạo file trong [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx):
```typescript
const [creationTarget, setCreationTarget] = useState<{ parentPath: string | null; isFile: boolean } | null>(null);
const [newItemName, setNewItemName] = useState('');
```

* **Handler kích hoạt hiển thị** ô nhập liệu:
```typescript
const handleCreateFile = () => {
  setCreationTarget({ parentPath: null, isFile: true });
  setNewItemName('');
};
```

* **Handler lưu tệp mới** và gọi **IPC API**:
```typescript
const handleSaveNewItem = async () => {
  if (!creationTarget) return;
  const name = newItemName.trim();
  if (!name) {
    handleCancelNewItem();
    return;
  }

  const { parentPath, isFile } = creationTarget;
  const relativePath = parentPath ? `${parentPath}/${name}` : name;

  try {
    if (isFile) {
      const pathName = relativePath.endsWith('.md') ? relativePath : `${relativePath}.md`;
      await fileService.createFile(pathName, `# ${name.replace('.md', '')}\n\n`);
      await loadTree();
      await handleSelectFile(pathName);
    } else {
      await fileService.createFolder(relativePath);
      await loadTree();
    }
  } catch (error) {
    console.error(error);
  } finally {
    handleCancelNewItem();
  }
};
```

* **Giao diện render Inline Input** trên cây thư mục:
```tsx
{creationTarget && creationTarget.parentPath === null && (
  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${creationTarget.isFile
    ? 'bg-blue-500/10 border border-blue-500/20'
    : 'bg-emerald-500/10 border border-emerald-500/20'
    }`}>
    {creationTarget.isFile ? (
      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
    ) : (
      <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
    )}
    <input
      autoFocus
      type="text"
      placeholder={creationTarget.isFile ? "note-name.md" : "Folder name"}
      value={newItemName}
      onChange={(e) => setNewItemName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSaveNewItem();
        else if (e.key === 'Escape') handleCancelNewItem();
      }}
      onBlur={handleSaveNewItem}
      className="bg-transparent outline-none text-white text-xs w-full"
    />
  </div>
)}
```

* **IPC Bridge** trong [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs):
```javascript
createFile: (relativePath, content) => ipcRenderer.invoke('create-file', relativePath, content),
```

* **IPC Main Handler** trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs):
```javascript
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
```

---

### 2. Luồng Tạo Folder Mới (Folder Creation Flow)

* **Handler kích hoạt** ô nhập thư mục mới:
```typescript
const handleCreateFolder = () => {
  setCreationTarget({ parentPath: null, isFile: false });
  setNewItemName('');
};
```

* **IPC Bridge** trong [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs):
```javascript
createFolder: (relativePath) => ipcRenderer.invoke('create-folder', relativePath),
```

* **IPC Main Handler** trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs):
```javascript
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
```

---

### 3. Luồng Quản lý Vault (Vault Selector Flow)

* **Handler kích hoạt hộp thoại chọn Vault** phía Renderer:
```typescript
const handleSelectVault = async () => {
  try {
    const path = await vaultService.selectVaultDir();
    if (path) {
      await loadVaultInfo();
      await loadTree();
      setActiveFilePath(null);
      setActiveFileTitle('Untitled');
      if (contentRef.current) {
        contentRef.current.innerText = '';
      }
    }
  } catch (err) {
    console.error(err);
  }
};
```

* **IPC Bridge** trong [preload.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/preload.cjs):
```javascript
selectVaultDir: () => ipcRenderer.invoke('select-vault-dir'),
```

* **IPC Main Handler** hiển thị Dialog của OS và cập nhật Electron Store:
```javascript
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
```

---

### 4. Luồng Hiển thị & Làm mới Cây Thư mục (Tree Rendering Flow)

* **Main Process** duyệt đệ quy tệp tin vật lý trong [main.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/main.cjs):
```javascript
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

  // Sắp xếp thư mục trước, sau đó đến file bảng chữ cái
  return result.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}
```

* **Renderer Process** vẽ cây thư mục đệ quy:
```tsx
const renderTree = (nodes: ExplorerNode[]) => {
  return nodes.map((node) => {
    if (renamingPath === node.path) {
      // Inline renaming mode
      ...
    }

    if (node.isFolder) {
      const isOpen = !!expandedFolders[node.path];
      const isDraggedOver = draggedOverFolder === node.path;
      return (
        <div key={node.path} className="select-none">
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOverFolder(e, node)}
            onDrop={(e) => handleDropOnFolder(e, node)}
            onClick={() => setExpandedFolders(prev => ({ ...prev, [node.path]: !prev[node.path] }))}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-gray-300 transition-all duration-150 ${isDraggedOver ? 'bg-emerald-500/20' : 'hover:bg-white/5'}`}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4 text-blue-400" />
            <span className="truncate">{node.name}</span>
          </div>

          {isOpen && (
            <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
              {node.children && renderTree(node.children)}
            </div>
          )}
        </div>
      );
    } else {
      const isActive = activeFilePath === node.path;
      return (
        <div key={node.path}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            onDragEnd={handleDragEnd}
            onClick={(e) => handleSelectFile(node.path, e.ctrlKey || e.metaKey)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition ${isActive ? 'bg-blue-500/10 text-blue-300' : 'hover:bg-white/5 text-gray-300'}`}
          >
            <FileText className="w-4 h-4" />
            <span className="truncate">{node.name}</span>
          </div>
        </div>
      );
    }
  });
};
```

---

### 5. Bộ giám sát thay đổi (Chokidar Watcher)

* **Thiết lập giám sát** trong [file_watcher.cjs](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/file_watcher.cjs):
```javascript
const chokidar = require('chokidar');
const path = require('path');

let watcher = null;

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
```

* **Lắng nghe sự kiện** trong React Component [App.tsx](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/App.tsx):
```typescript
useEffect(() => {
  const electron = window.electron;
  if (!electron) return;

  electron.onVaultTreeChanged(async (payload: { event: string; type: string; path: string }) => {
    // Reload filesystem tree representation
    const tree = await fileService.getVaultTree();
    setDirectoryTrees(tree);

    const allPaths = getMdFilesFromTree(tree);
    const syncManager = SyncManager.getInstance();

    if (payload.type === 'file' && payload.path.endsWith('.md')) {
      if (payload.event === 'create' || payload.event === 'modify') {
        try {
          const content = await fileService.readFile(payload.path);
          syncManager.handleFileChange(payload.path, content, allPaths);
          setScanTrigger(prev => prev + 1);
        } catch (err) {
          console.error('Failed incremental sync for file:', payload.path, err);
        }
      } else if (payload.event === 'delete') {
        syncManager.handleFileDelete(payload.path, allPaths);
        setScanTrigger(prev => prev + 1);
      }
    }
    
    // Xử lý hiển thị Toast thông báo ngoại trừ những sự kiện bị bỏ qua
    ...
  });

  return () => {
    electron.offVaultTreeChanged();
  };
}, []);
```

---
---

![[Tóm tắt mục tiêu và deliverables phase 2]]
# Phase 2 — Core Knowledge Runtime

### 1. Bộ điều phối Pipeline Trích xuất (block-extractor.ts)

* Tệp nguồn [block-extractor.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/parser/block-extractor.ts):
```typescript
import type { RuntimeBlock } from '../types/runtime-types';
import { parseMarkdownToRawBlocks } from './markdown-parser';
import { buildRuntimeBlocks } from './runtime-builder';
import { normalizeRuntimeBlocks } from './runtime-normalizer';

/**
 * Phân tích cú pháp văn bản Markdown thô và trích xuất một mảng phẳng các RuntimeBlock đã được chuẩn hóa.
 */
export function extractBlocksFromMarkdown(content: string, sourceFile: string): RuntimeBlock[] {
  const rawBlocks = parseMarkdownToRawBlocks(content);
  const runtimeBlocks = buildRuntimeBlocks(rawBlocks, sourceFile);
  return normalizeRuntimeBlocks(runtimeBlocks);
}
```

---

### 2. Bộ phân tích cú pháp Markdown (markdown-parser.ts)

* Phân tích tệp Markdown thành các **RawBlock** dựa trên các thẻ comment biên của khối:
```typescript
export function parseMarkdownToRawBlocks(content: string): RawBlock[] {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.includes('<!-- block ')) {
    return [{
      type: 'paragraph',
      content: content,
      lineStart: 1,
      lineEnd: content.split('\n').length
    }];
  }

  const lines = normalized.split('\n');
  const blocks: RawBlock[] = [];
  let currentMeta: any = null;
  let currentBlockContent: string[] = [];
  let currentBlockStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentMatch = line.match(/^<!-- block\s+(.*?)\s*-->$/);
    if (commentMatch) {
      if (currentMeta) {
        blocks.push({
          id: currentMeta.id,
          type: currentMeta.type || 'paragraph',
          content: currentBlockContent.join('\n'),
          lineStart: currentBlockStartLine,
          lineEnd: i,
          level: currentMeta.level,
          info: currentMeta.info,
          checked: currentMeta.checked
        });
        currentBlockContent = [];
      }
      
      const metaStr = commentMatch[1];
      const idMatch = metaStr.match(/id="([^"]+)"/);
      const levelMatch = metaStr.match(/level="([^"]+)"/);
      const typeMatch = metaStr.match(/type="([^"]+)"/);
      const infoMatch = metaStr.match(/info="([^"]+)"/);
      const checkedMatch = metaStr.match(/checked="([^"]+)"/);

      currentMeta = {
        id: idMatch ? idMatch[1] : undefined,
        level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
        type: typeMatch ? typeMatch[1] : 'paragraph',
        info: infoMatch ? infoMatch[1] : undefined,
        checked: checkedMatch ? checkedMatch[1] === 'true' : undefined
      };
      
      currentBlockStartLine = i + 2;
    } else {
      if (currentMeta) {
        currentBlockContent.push(line);
      } else {
        currentMeta = { type: 'paragraph', level: 0 };
        currentBlockStartLine = 1;
        currentBlockContent.push(line);
      }
    }
  }

  if (currentMeta) {
    blocks.push({
      id: currentMeta.id,
      type: currentMeta.type || 'paragraph',
      content: currentBlockContent.join('\n'),
      lineStart: currentBlockStartLine,
      lineEnd: lines.length,
      level: currentMeta.level,
      info: currentMeta.info,
      checked: currentMeta.checked
    });
  }

  return blocks;
}
```

* Phân tích cú pháp và tuần tự hóa **YAML Frontmatter Properties**:
```typescript
export function parseFrontmatter(content: string): { properties: Record<string, any>; remainingContent: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  
  if (!match) {
    return { properties: {}, remainingContent: content };
  }
  
  const frontmatterText = match[1];
  const remainingContent = normalized.slice(match[0].length);
  const properties: Record<string, any> = {};
  
  const lines = frontmatterText.split('\n');
  let currentKey = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('-') && currentKey) {
      const val = trimmed.slice(1).trim();
      if (!Array.isArray(properties[currentKey])) {
        properties[currentKey] = [];
      }
      properties[currentKey].push(val);
      continue;
    }
    
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      currentKey = key;
      
      if (val.startsWith('[') && val.endsWith(']')) {
        properties[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else if (val) {
        properties[key] = val;
      } else {
        properties[key] = [];
      }
    }
  }
  
  return { properties, remainingContent };
}
```

---

### 3. Bộ Token hóa Inline & Sinh ID (runtime-builder.ts & id-generator.ts)

* Phân tích các phần tử inline từ chuỗi ký tự bằng khớp Regex:
```typescript
export function tokenizeInlineContent(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let index = 0;

  while (index < text.length) {
    const sub = text.substring(index);

    // 1. Embeds: ![[link]]
    const embedMatch = sub.match(/^!\[\[([^\]]+)\]\]/);
    if (embedMatch) {
      nodes.push({ type: 'embed', content: embedMatch[1], raw: embedMatch[0] });
      index += embedMatch[0].length;
      continue;
    }

    // 2. Wikilinks: [[link]]
    const wikilinkMatch = sub.match(/^\[\[([^\]]+)\]\]/);
    if (wikilinkMatch) {
      nodes.push({ type: 'wikilink', content: wikilinkMatch[1], raw: wikilinkMatch[0] });
      index += wikilinkMatch[0].length;
      continue;
    }

    // 3. Bold: **text**
    const boldMatch = sub.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push({ type: 'bold', content: boldMatch[1], raw: boldMatch[0] });
      index += boldMatch[0].length;
      continue;
    }

    // 4. Italic: *text*
    const italicMatch = sub.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push({ type: 'italic', content: italicMatch[1], raw: italicMatch[0] });
      index += italicMatch[0].length;
      continue;
    }

    // 5. Code: `code`
    const codeMatch = sub.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({ type: 'code', content: codeMatch[1], raw: codeMatch[0] });
      index += codeMatch[0].length;
      continue;
    }

    // 6. Hashtags: #tag
    const hashtagMatch = sub.match(/^#([a-zA-Z0-9_-]+)/);
    if (hashtagMatch) {
      const raw = hashtagMatch[0];
      const tag = hashtagMatch[1];
      const isStart = index === 0;
      const isPrecededBySpace = !isStart && /\s/.test(text[index - 1]);
      const isHexColor = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tag) && 
                         (sub.length === raw.length || !/[a-zA-Z0-9_-]/.test(sub[raw.length]));

      if ((isStart || isPrecededBySpace) && !isHexColor) {
        nodes.push({ type: 'hashtag', content: tag.toLowerCase(), raw });
        index += raw.length;
        continue;
      }
    }

    // 7. Regular Text
    const nextSpecialIndex = sub.substring(1).search(/!\[\[|\[\[|\*\*|\*|`|#/);
    if (nextSpecialIndex === -1) {
      const textContent = sub;
      const prevNode = nodes[nodes.length - 1];
      if (prevNode && prevNode.type === 'text') {
        prevNode.content += textContent;
        prevNode.raw += textContent;
      } else {
        nodes.push({ type: 'text', content: textContent, raw: textContent });
      }
      break;
    } else {
      const textContent = sub.substring(0, nextSpecialIndex + 1);
      const prevNode = nodes[nodes.length - 1];
      if (prevNode && prevNode.type === 'text') {
        prevNode.content += textContent;
        prevNode.raw += textContent;
      } else {
        nodes.push({ type: 'text', content: textContent, raw: textContent });
      }
      index += textContent.length;
    }
  }

  return nodes;
}
```

* Sinh mã băm **FNV-1a 32-bit** làm ID cho Block trong [id-generator.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/utils/id-generator.ts):
```typescript
export function generateBlockId(filePath: string, index: number, content: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedContent = content.trim();
  const input = `${normalizedPath}:${index}:${normalizedContent}`;

  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  const unsignedHash = hash >>> 0;
  return `block://${unsignedHash.toString(16)}`;
}
```

---

### 4. Bộ chuẩn hóa cấu trúc cây (runtime-normalizer.ts)

* Dựng quan hệ cha-con dựa trên cấu trúc thụt đầu dòng (indentation level) sử dụng **Stack**:
```typescript
export function normalizeRuntimeBlocks(blocks: RuntimeBlock[]): RuntimeBlock[] {
  const stack: { id: string; level: number }[] = [];

  for (const block of blocks) {
    block.parentId = null;
    block.childrenIds = [];
    block.metadata.parentId = undefined;
    block.metadata.childrenIds = [];
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const level = block.level ?? 0;

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length > 0) {
      const parentId = stack[stack.length - 1].id;
      block.parentId = parentId;
      block.metadata.parentId = parentId;

      const parentBlock = blocks.find(b => b.id === parentId);
      if (parentBlock) {
        if (!parentBlock.childrenIds) parentBlock.childrenIds = [];
        parentBlock.childrenIds.push(block.id);

        if (!parentBlock.metadata.childrenIds) parentBlock.metadata.childrenIds = [];
        parentBlock.metadata.childrenIds.push(block.id);
      }
    }

    stack.push({ id: block.id, level });
  }

  return blocks;
}
```

---

### 5. In-Memory Block Registry (block-registry.ts)

* Quản lý lưu trữ trong bộ nhớ đệm tất cả các khối tài liệu của Workspace giúp truy vấn với độ phức tạp **O(1)**:
```typescript
export class BlockRegistry {
  private static instance: BlockRegistry | null = null;
  private blocks = new Map<string, RuntimeBlock>();
  private fileToBlocks = new Map<string, Set<string>>();

  private constructor() {}

  public static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  public registerBlocks(filePath: string, newBlocks: RuntimeBlock[]): void {
    const normalizedPath = filePath.replace(/\\/g, '/');
    this.unregisterFile(normalizedPath);

    const blockIds = new Set<string>();
    for (const block of newBlocks) {
      this.blocks.set(block.id, block);
      blockIds.add(block.id);
    }
    this.fileToBlocks.set(normalizedPath, blockIds);
  }

  public unregisterFile(filePath: string): void {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const existingIds = this.fileToBlocks.get(normalizedPath);
    if (existingIds) {
      for (const id of existingIds) {
        this.blocks.delete(id);
      }
      this.fileToBlocks.delete(normalizedPath);
    }
  }

  public getBlock(id: string): RuntimeBlock | undefined {
    return this.blocks.get(id);
  }
}
```

---

### 6. In-Memory Relationship Index (relationship-index.ts)

* Quản lý quan hệ liên kết ngược (**Backlinks**) và định mục thẻ nhãn (**Tags Index**):
```typescript
export class RelationshipIndex {
  private static instance: RelationshipIndex | null = null;
  private backlinks = new Map<string, Set<string>>();
  private forwardReferences = new Map<string, Set<string>>();
  private tagIndex = new Map<string, Set<string>>();
  private fileTags = new Map<string, Set<string>>();

  private constructor() {}

  public static getInstance(): RelationshipIndex {
    if (!RelationshipIndex.instance) {
      RelationshipIndex.instance = new RelationshipIndex();
    }
    return RelationshipIndex.instance;
  }

  public registerFileRelations(sourceFile: string, resolvedTargets: string[], tags: string[]): void {
    const src = sourceFile.replace(/\\/g, '/');
    this.unregisterFile(src);

    const targetsSet = new Set<string>();
    for (const target of resolvedTargets) {
      const dest = target.replace(/\\/g, '/');
      targetsSet.add(dest);

      if (!this.backlinks.has(dest)) this.backlinks.set(dest, new Set());
      this.backlinks.get(dest)!.add(src);
    }
    this.forwardReferences.set(src, targetsSet);

    const tagsSet = new Set<string>();
    for (const tag of tags) {
      const normalizedTag = tag.toLowerCase();
      tagsSet.add(normalizedTag);

      if (!this.tagIndex.has(normalizedTag)) this.tagIndex.set(normalizedTag, new Set());
      this.tagIndex.get(normalizedTag)!.add(src);
    }
    this.fileTags.set(src, tagsSet);
  }

  public unregisterFile(sourceFile: string): void {
    const src = sourceFile.replace(/\\/g, '/');
    const targets = this.forwardReferences.get(src);
    if (targets) {
      for (const dest of targets) {
        const sources = this.backlinks.get(dest);
        if (sources) {
          sources.delete(src);
          if (sources.size === 0) this.backlinks.delete(dest);
        }
      }
      this.forwardReferences.delete(src);
    }
    this.backlinks.delete(src);

    const tags = this.fileTags.get(src);
    if (tags) {
      for (const tag of tags) {
        const files = this.tagIndex.get(tag);
        if (files) {
          files.delete(src);
          if (files.size === 0) this.tagIndex.delete(tag);
        }
      }
      this.fileTags.delete(src);
    }
  }

  public getBacklinks(targetFile: string): string[] {
    return this.backlinks.get(targetFile.replace(/\\/g, '/')) ? Array.from(this.backlinks.get(targetFile.replace(/\\/g, '/'))!) : [];
  }
}
```

---

### 7. Sync Manager & Document Update (sync-manager.ts & runtime-sync.ts)

* Quản lý điều phối vòng đời đồng bộ khi file thay đổi trong [sync-manager.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/sync-manager.ts):
```typescript
export class SyncManager {
  private static instance: SyncManager | null = null;
  private documents = new Map<string, RuntimeDocument>();

  private constructor() {}

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  public handleFileChange(filePath: string, content: string, allPaths: string[]): RuntimeDocument {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const oldDoc = this.documents.get(normalizedPath) || null;

    const { properties, remainingContent } = parseFrontmatter(content);
    const blocks = extractBlocksFromMarkdown(remainingContent, normalizedPath);

    const firstH1 = blocks.find(b => b.type === 'heading' && b.level === 1);
    const fileName = normalizedPath.split('/').pop() ?? 'Untitled';
    const title = firstH1 ? firstH1.content.trim() : fileName.replace(/\.md$/i, '');

    const tagsSet = new Set<string>();
    const refsSet = new Set<string>();
    let wordCount = 0;
    const charCount = content.length;

    if (properties.tags) {
      if (Array.isArray(properties.tags)) {
        properties.tags.forEach((t: string) => tagsSet.add(t));
      } else if (typeof properties.tags === 'string') {
        properties.tags.split(',').map(s => s.trim()).filter(Boolean).forEach(t => tagsSet.add(t));
      }
    }

    for (const block of blocks) {
      for (const tag of block.metadata.tags) tagsSet.add(tag);
      for (const ref of block.metadata.references) refsSet.add(ref);
      if (block.content) {
        wordCount += block.content.trim().split(/\s+/).filter(Boolean).length;
      }
    }

    const newDoc: RuntimeDocument = {
      path: normalizedPath,
      title,
      blocks,
      tags: Array.from(tagsSet),
      references: Array.from(refsSet),
      wordCount,
      charCount
    };

    this.documents.set(normalizedPath, newDoc);
    syncDocumentRuntime(normalizedPath, oldDoc, newDoc, allPaths);

    return newDoc;
  }
}
```

* Cập nhật Registry và mối quan hệ đồ thị trong [runtime-sync.ts](file:///c:/Users/Admin/Documents/Projects/Test%20Projects/Module%20Test/src/runtime/sync/runtime-sync.ts):
```typescript
export function syncDocumentRuntime(
  filePath: string,
  oldDoc: RuntimeDocument | null,
  newDoc: RuntimeDocument | null,
  allPaths: string[]
): void {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const registry = BlockRegistry.getInstance();
  const blockRuntime = BlockRuntime.getInstance();
  const graph = GraphRuntime.getInstance();
  const index = RelationshipIndex.getInstance();

  const docNodeId = `doc://${normalizedPath}`;

  if (!newDoc) {
    if (oldDoc) {
      for (const block of oldDoc.blocks) {
        blockRuntime.notifyDeleted(block.id);
      }
    }
    registry.unregisterFile(normalizedPath);
    index.unregisterFile(normalizedPath);
    graph.removeNode(docNodeId);
    return;
  }

  registry.registerBlocks(normalizedPath, newDoc.blocks);

  const resolvedTargets: string[] = [];
  for (const ref of newDoc.references) {
    const resolved = resolveLinkPath(ref, normalizedPath, allPaths);
    if (resolved) resolvedTargets.push(resolved);
  }
  index.registerFileRelations(normalizedPath, resolvedTargets, newDoc.tags);

  graph.removeNode(docNodeId);
  graph.addNode({ id: docNodeId, type: 'document', name: newDoc.title });

  for (const tag of newDoc.tags) {
    const tagNodeId = `tag://${tag}`;
    graph.addNode({ id: tagNodeId, type: 'tag', name: `#${tag}` });
    graph.addEdge({ source: docNodeId, target: tagNodeId, type: 'tag' });
  }

  for (const target of resolvedTargets) {
    graph.addEdge({ source: docNodeId, target: `doc://${target}`, type: 'link' });
  }

  for (const block of newDoc.blocks) {
    graph.addNode({ id: block.id, type: 'block', name: block.type });
    graph.addEdge({ source: docNodeId, target: block.id, type: 'block-ref' });

    if (block.metadata.parentId) {
      graph.addEdge({ source: block.metadata.parentId, target: block.id, type: 'block-ref' });
    }
  }

  const oldBlocks = oldDoc ? oldDoc.blocks : [];
  const { added, removed, updated } = diffBlocks(oldBlocks, newDoc.blocks);

  for (const block of added) blockRuntime.notifyCreated(block);
  for (const block of updated) blockRuntime.notifyUpdated(block);
  for (const id of removed) blockRuntime.notifyDeleted(id);
}
```

---

### 8. Thuật toán so sánh khối (Block Diffing) (block-diff.ts & block-runtime.ts)

* Tính toán sự khác biệt giữa hai trạng thái khối để xác định các thay đổi:
```typescript
export function diffBlocks(oldBlocks: RuntimeBlock[], newBlocks: RuntimeBlock[]): BlockDiff {
  const added: RuntimeBlock[] = [];
  const removed: string[] = [];
  const updated: RuntimeBlock[] = [];
  const moved: RuntimeBlock[] = [];

  const oldMap = new Map<string, RuntimeBlock>();
  for (const b of oldBlocks) oldMap.set(b.id, b);

  const newMap = new Map<string, RuntimeBlock>();
  for (const b of newBlocks) newMap.set(b.id, b);

  for (const b of oldBlocks) {
    if (!newMap.has(b.id)) {
      removed.push(b.id);
    }
  }

  for (let i = 0; i < newBlocks.length; i++) {
    const newBlock = newBlocks[i];
    const oldBlock = oldMap.get(newBlock.id);

    if (!oldBlock) {
      const correspondingOldBlock = oldBlocks[i];
      const isContentReplacement = correspondingOldBlock && 
                                   correspondingOldBlock.type === newBlock.type && 
                                   !newMap.has(correspondingOldBlock.id);

      if (isContentReplacement) {
        updated.push(newBlock);
        const remIdx = removed.indexOf(correspondingOldBlock.id);
        if (remIdx !== -1) removed.splice(remIdx, 1);
      } else {
        added.push(newBlock);
      }
    } else {
      const shifted = oldBlock.metadata.lineStart !== newBlock.metadata.lineStart ||
                      oldBlock.metadata.lineEnd !== newBlock.metadata.lineEnd ||
                      oldBlock.metadata.parentId !== newBlock.metadata.parentId;
      if (shifted) {
        moved.push(newBlock);
      }
    }
  }

  return { added, removed, updated, moved };
}
```

---

# P3 — SQLite Caching & Database Search Layer

### 1. SQLite Database Service (database_service.cjs)

* Khởi tạo cơ sở dữ liệu SQLite tại thư mục `.module-test/metadata.db` trong vault:
```javascript
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let SQL = null;
let currentDbPath = null;

async function initDatabase(vaultPath) {
  if (!SQL) SQL = await initSqlJs();
  closeDatabase();

  const dbDir = path.join(vaultPath, '.module-test');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  currentDbPath = path.join(dbDir, 'metadata.db');
  if (fs.existsSync(currentDbPath)) {
    try {
      const filebuffer = fs.readFileSync(currentDbPath);
      db = new SQL.Database(filebuffer);
    } catch (err) {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create DDL tables (documents, blocks, file_references, file_tags)
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      char_count INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      properties TEXT NOT NULL
    );
  `);
  // (Blocks, file_references, file_tags tables omitted for brevity...)
  db.run("PRAGMA foreign_keys = ON;");
}
```

* Lưu trữ thông tin tài liệu và phân tích khối vào SQLite:
```javascript
function saveDocument(doc, mtimeMs, size) {
  if (!db) return;
  try {
    db.run("BEGIN TRANSACTION;");

    // Insert Document
    const insertDocStmt = db.prepare(`
      INSERT OR REPLACE INTO documents (path, title, word_count, char_count, mtime_ms, size, properties)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertDocStmt.run([doc.path, doc.title, doc.wordCount, doc.charCount, mtimeMs, size, JSON.stringify(doc.properties || {})]);
    insertDocStmt.free();

    // Clear old block references to prevent duplicate keys
    db.run("DELETE FROM blocks WHERE document_path = '" + doc.path + "'");
    db.run("DELETE FROM file_tags WHERE document_path = '" + doc.path + "'");
    db.run("DELETE FROM file_references WHERE source_path = '" + doc.path + "'");

    // Insert Blocks
    const insertBlockStmt = db.prepare(`
      INSERT INTO blocks (id, document_path, type, level, content, info, line_start, line_end, parent_id, children_ids, tags, refs, checked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const block of doc.blocks) {
      insertBlockStmt.run([
        block.id, doc.path, block.type, block.level || null, block.content || '', block.info || null,
        block.metadata.lineStart, block.metadata.lineEnd, block.parentId || null,
        JSON.stringify(block.childrenIds || []), JSON.stringify(block.metadata.tags || []),
        JSON.stringify(block.metadata.references || []), block.metadata.checked ? 1 : 0
      ]);
    }
    insertBlockStmt.free();

    db.run("COMMIT;");
    saveDatabase();
  } catch (err) {
    db.run("ROLLBACK;");
    throw err;
  }
}
```

* Truy vấn tìm kiếm ghi chú và khối trong SQLite:
```javascript
function searchNotesAndBlocks(queryText) {
  if (!db) return [];
  const cleanQuery = queryText.trim();
  const terms = cleanQuery.split(/\s+/).filter(t => t.length > 0);
  
  const tagTerms = [];
  const textTerms = [];
  for (const term of terms) {
    if (term.startsWith('#')) {
      const tag = term.slice(1).toLowerCase();
      if (tag) tagTerms.push(tag);
    } else {
      textTerms.push(term.toLowerCase());
    }
  }

  // Queries matches dynamically based on blocks text and hashtag indexes
  let blockQuery = "SELECT * FROM blocks";
  const blockParams = [];
  const blockConditions = [];
  
  for (const term of textTerms) {
    blockConditions.push("LOWER(content) LIKE ?");
    blockParams.push(`%${term}%`);
  }
  for (const tag of tagTerms) {
    blockConditions.push("LOWER(tags) LIKE ?");
    blockParams.push(`%"${tag}"%`);
  }
  if (blockConditions.length > 0) {
    blockQuery += " WHERE " + blockConditions.join(" OR ");
  }

  const blockStmt = db.prepare(blockQuery);
  if (blockParams.length > 0) blockStmt.bind(blockParams);

  // Group matching blocks by document path and return filtered results
  // (Retrieval code omitted for brevity...)
}
```

---

### 2. Main Process IPC Registration (main.cjs)

* Đăng ký IPC channels xử lý giao tiếp giữa Renderer và Database Service:
```javascript
ipcMain.handle('sqlite-get-file-stats', async () => {
  const cachedStats = dbService.getStoredFileStats();
  const diskStats = {};

  // Recursively scans the filesystem for .md files to build diskStats
  const scanDir = (dirPath, relativeDir = '') => {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      const relPath = relativeDir ? `${relativeDir}/${file.name}` : file.name;
      const absPath = path.join(dirPath, file.name);
      if (file.isDirectory() && !file.name.startsWith('.')) {
        scanDir(absPath, relPath);
      } else if (file.name.endsWith('.md')) {
        const stat = fs.statSync(absPath);
        diskStats[relPath] = { mtimeMs: stat.mtimeMs, size: stat.size };
      }
    }
  };
  scanDir(vaultPath);
  return { cachedStats, diskStats };
});

ipcMain.handle('sqlite-load-cache', async () => {
  return dbService.loadCachedDocuments();
});

ipcMain.handle('sqlite-save-document', async (event, doc, mtimeMs, size) => {
  return dbService.saveDocument(doc, mtimeMs, size);
});

ipcMain.handle('sqlite-search-notes', async (event, queryText) => {
  return dbService.searchNotesAndBlocks(queryText);
});
```

---

### 3. Renderer-Side SQLite Hydration (App.tsx)

* Đồng bộ hóa và khôi phục nhanh in-memory index từ SQLite cache (Hydration):
```typescript
const initialVaultScan = useCallback(async (tree: ExplorerNode[]) => {
  const mdFiles = getMdFilesFromTree(tree);
  const syncManager = SyncManager.getInstance();
  syncManager.handleVaultSwitch(); 

  try {
    const { cachedStats, diskStats } = await fileService.sqliteGetFileStats();
    const cachedDocsList = await fileService.sqliteLoadCache();
    
    const cachedDocsMap = new Map<string, any>();
    for (const doc of cachedDocsList) cachedDocsMap.set(doc.path, doc);

    for (const filePath of mdFiles) {
      const normPath = filePath.replace(/\\/g, '/');
      const diskStat = diskStats[normPath];
      const cachedStat = cachedStats[normPath];
      const cachedDoc = cachedDocsMap.get(normPath);

      // Cache Hit: stats match
      if (diskStat && cachedStat && cachedDoc &&
          diskStat.mtimeMs === cachedStat.mtimeMs &&
          diskStat.size === cachedStat.size) {
        syncManager.registerParsedDocument(cachedDoc, mdFiles);
      } else {
        // Cache Miss: read & parse
        const content = await fileService.readFile(filePath);
        const doc = syncManager.handleFileChange(filePath, content, mdFiles);
        if (diskStat) {
          await fileService.sqliteSaveDocument(doc, diskStat.mtimeMs, diskStat.size);
        }
      }
    }
    setScanTrigger(prev => prev + 1);
  } catch (err) {
    console.error('Failed SQLite database incremental scan, falling back to full scan', err);
  }
}, [getMdFilesFromTree]);
```

---

### 4. SQLite Debounced Search Engine (App.tsx)

* Kích hoạt tìm kiếm cơ sở dữ liệu có cơ chế Debounce:
```typescript
useEffect(() => {
  const q = searchQuery.trim();
  if (!q) {
    setSearchResults([]);
    setIsSearching(false);
    return;
  }

  setIsSearching(true);
  const delayDebounce = setTimeout(async () => {
    try {
      // Calls SQLite Search Query
      const results = await fileService.sqliteSearchNotes(q);
      setSearchResults(results);
    } catch (err) {
      console.error("Failed executing SQLite notes search:", err);
    } finally {
      setIsSearching(false);
    }
  }, 250); // 250ms debounce time

  return () => clearTimeout(delayDebounce);
}, [searchQuery, scanTrigger]);
```

```
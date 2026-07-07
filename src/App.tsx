import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { File, Plus, RotateCw, ChevronDown, ChevronRight, Folder, FileText, Tag, Clock, Database, Link2, CheckCircle, FolderOpen, Trash2, X, Edit3, FolderPlus, FilePlus, Search, Move } from 'lucide-react';
import { fileService } from './file_Service';
import { vaultService } from './vault_Service';
import type { ExplorerNode, VaultInfo } from './types';

// Runtime Engine imports
import { SyncManager } from './runtime/sync/sync-manager';
import { KnowledgeQueryEngine } from './runtime/graph/knowledge-query-engine';
import { resolveLinkPath } from './runtime/graph/link-resolver';
import { extractBlocksFromMarkdown } from './runtime/parser/block-extractor';
import { serializeBlocksToMarkdown, parseFrontmatter, serializeFrontmatter } from './runtime/parser/markdown-parser';
import type { RuntimeBlock } from './runtime/types/runtime-types';
import { BlockEditor } from './components/BlockEditor';
import { refactorLinksOnRename } from './runtime/utils/link-refactor';

type ToastType = 'create-file' | 'create-folder' | 'modify' | 'delete' | 'vault';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const HighlightQueryText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <span>{text}</span>;

  const terms = query.split(/\s+/).map(t => {
    if (t.startsWith('#')) return t.slice(1);
    return t;
  }).filter(Boolean);

  if (terms.length === 0) return <span>{text}</span>;

  const escapedTerms = terms.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = terms.some(t => t.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-blue-500/30 text-blue-200 px-0.5 rounded font-medium">{part}</mark>
        ) : (
          part
        );
      })}
    </span>
  );
};

function App() {
  // Window controls
  const handleMinimize = () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      window.electron.minimize();
    }
  };

  const handleMaximize = () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      window.electron.maximize();
    }
  };

  const handleClose = () => {
    // @ts-ignore
    if (window.electron) {
      // @ts-ignore
      window.electron.close();
    }
  };

  // State
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [isLoadingVault, setIsLoadingVault] = useState(true);
  const [directoryTrees, setDirectoryTrees] = useState<ExplorerNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'Projects': true
  });

  // Sidebar Search State
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'search'>('explorer');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingScrollToBlockId, setPendingScrollToBlockId] = useState<string | null>(null);

  // Editor State
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const activeFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);
  const [activeFileTitle, setActiveFileTitle] = useState<string>('Untitled');

  // Vùng tham chiếu DOM để truy xuất nội dung editor
  const contentRef = useRef<HTMLDivElement>(null);

  // File/Folder Creation Target & Inline states
  const [creationTarget, setCreationTarget] = useState<{ parentPath: string | null; isFile: boolean } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');

  // Tabs Management State
  const [openTabs, setOpenTabs] = useState<{ path: string; title: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    node: ExplorerNode | null;
    type?: 'node' | 'vault';
  }>({ visible: false, x: 0, y: 0, node: null, type: 'node' });

  // Structured Knowledge Runtime UI states
  const [editorBlocks, setEditorBlocks] = useState<RuntimeBlock[]>([]);
  const [noteProperties, setNoteProperties] = useState<Record<string, any>>({});
  const [scanTrigger, setScanTrigger] = useState<number>(0);

  // Property addition form states
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [newPropType, setNewPropType] = useState<'tags' | 'list'>('tags');
  const [newPropKey, setNewPropKey] = useState('');

  // Tag inputs and suggestion dropdown states
  const [activeTagInputs, setActiveTagInputs] = useState<Record<string, string>>({});
  const [focusedPropertyInputKey, setFocusedPropertyInputKey] = useState<string | null>(null);
  const [showTagSuggestions, setShowTagSuggestions] = useState<Record<string, boolean>>({});

  // Drag & Drop State
  const [draggedNode, setDraggedNode] = useState<ExplorerNode | null>(null);
  const [draggedOverFolder, setDraggedOverFolder] = useState<string | null>(null);

  // Move Modal State
  const [movingNode, setMovingNode] = useState<ExplorerNode | null>(null);
  const [moveSearchQuery, setMoveSearchQuery] = useState('');

  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const ignoredWatcherPathsRef = useRef<{ path: string; event: 'create' | 'modify' | 'delete'; timestamp: number }[]>([]);

  const ignoreWatcherToast = useCallback((path: string, event: 'create' | 'modify' | 'delete') => {
    ignoredWatcherPathsRef.current.push({
      path: path.replace(/\\/g, '/'),
      event,
      timestamp: Date.now()
    });
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // Recursively gets all .md files from Explorer trees
  const getMdFilesFromTree = useCallback((nodes: ExplorerNode[]): string[] => {
    const result: string[] = [];
    const traverse = (nList: ExplorerNode[]) => {
      for (const n of nList) {
        if (n.isFolder) {
          if (n.children) traverse(n.children);
        } else {
          if (n.path.endsWith('.md')) {
            result.push(n.path);
          }
        }
      }
    };
    traverse(nodes);
    return result;
  }, []);

  // Background full scan of the vault
  const initialVaultScan = useCallback(async (tree: ExplorerNode[]) => {
    const mdFiles = getMdFilesFromTree(tree);
    const syncManager = SyncManager.getInstance();
    syncManager.handleVaultSwitch(); // reset registries & indexes

    try {
      const { cachedStats, diskStats } = await fileService.sqliteGetFileStats();
      const cachedDocsList = await fileService.sqliteLoadCache();
      
      const cachedDocsMap = new Map<string, any>();
      for (const doc of cachedDocsList) {
        cachedDocsMap.set(doc.path, doc);
      }

      let cachedCount = 0;
      let scanCount = 0;

      for (const filePath of mdFiles) {
        const normPath = filePath.replace(/\\/g, '/');
        const diskStat = diskStats[normPath];
        const cachedStat = cachedStats[normPath];
        const cachedDoc = cachedDocsMap.get(normPath);

        if (diskStat && cachedStat && cachedDoc &&
            diskStat.mtimeMs === cachedStat.mtimeMs &&
            diskStat.size === cachedStat.size) {
          syncManager.registerParsedDocument(cachedDoc, mdFiles);
          cachedCount++;
        } else {
          try {
            const content = await fileService.readFile(filePath);
            const doc = syncManager.handleFileChange(filePath, content, mdFiles);
            if (diskStat) {
              await fileService.sqliteSaveDocument(doc, diskStat.mtimeMs, diskStat.size);
            }
            scanCount++;
          } catch (err) {
            console.error('Failed to parse file during initial scan:', filePath, err);
          }
        }
      }

      for (const cachedPath of Object.keys(cachedStats)) {
        if (!mdFiles.includes(cachedPath)) {
          await fileService.sqliteDeleteDocument(cachedPath);
        }
      }

      console.log(`SQLite Hydration: Hydrated ${cachedCount} notes from cache, scanned ${scanCount} new/modified notes.`);
      addToast('vault', `Vault loaded: ${cachedCount} from cache, ${scanCount} scanned`);
    } catch (err) {
      console.error('Failed SQLite database incremental scan, falling back to full scan:', err);
      for (const filePath of mdFiles) {
        try {
          const content = await fileService.readFile(filePath);
          syncManager.handleFileChange(filePath, content, mdFiles);
        } catch (error) {
          console.error('Failed to parse file during fallback scan:', filePath, error);
        }
      }
    }
    setScanTrigger(prev => prev + 1);
  }, [getMdFilesFromTree, addToast]);

  const loadVaultInfo = useCallback(async () => {
    setIsLoadingVault(true);
    try {
      const info = await vaultService.getVaultInfo();
      setVaultInfo(info);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingVault(false);
    }
  }, []);

  // Load Vault and directory list on mount with full vault scan
  useEffect(() => {
    const initialize = async () => {
      await loadVaultInfo();
      const tree = await fileService.getVaultTree();
      setDirectoryTrees(tree);
      await initialVaultScan(tree);
    };
    initialize();
  }, [initialVaultScan, loadVaultInfo]);

  // Global click event to close Context Menu
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Sync tab title when activeFileTitle changes
  useEffect(() => {
    if (activeTabPath) {
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, title: activeFileTitle } : t));
    }
  }, [activeFileTitle, activeTabPath]);

  // Register file/vault watcher listeners
  useEffect(() => {
    // @ts-ignore
    const electron = window.electron;
    if (!electron) return;

    electron.onVaultTreeChanged(async (payload: { event: string; type: string; path: string }) => {
      // Reload filesystem tree representation
      const tree = await fileService.getVaultTree();
      setDirectoryTrees(tree);

      const allPaths = getMdFilesFromTree(tree);
      const syncManager = SyncManager.getInstance();

      // Incremental sync of structured knowledge objects
      if (payload.type === 'file' && payload.path.endsWith('.md')) {
        const normPayloadPath = payload.path.replace(/\\/g, '/');
        if (payload.event === 'create' || payload.event === 'modify') {
          try {
            const content = await fileService.readFile(payload.path);
            const doc = syncManager.handleFileChange(payload.path, content, allPaths);
            setScanTrigger(prev => prev + 1); // reactive refresh properties/backlinks

            // Persist to SQLite cache
            const stat = await fileService.sqliteGetSingleFileStat(payload.path);
            if (stat) {
              await fileService.sqliteSaveDocument(doc, stat.mtimeMs, stat.size);
            }

            // If the modified file is the currently active file, reload the editor content
            const currentActivePath = activeFilePathRef.current;
            if (currentActivePath && normPayloadPath === currentActivePath.replace(/\\/g, '/')) {
              const { properties, remainingContent } = parseFrontmatter(content);
              setNoteProperties(properties);
              const blocks = extractBlocksFromMarkdown(remainingContent, currentActivePath);
              setEditorBlocks(blocks);
            }
          } catch (err) {
            console.error('Failed incremental sync for file:', payload.path, err);
          }
        } else if (payload.event === 'delete') {
          syncManager.handleFileDelete(payload.path, allPaths);
          await fileService.sqliteDeleteDocument(payload.path);
          setScanTrigger(prev => prev + 1); // reactive refresh
        }
      }

      // Clean up old ignored paths (older than 3 seconds)
      const now = Date.now();
      ignoredWatcherPathsRef.current = ignoredWatcherPathsRef.current.filter(item => now - item.timestamp < 3000);

      // Check if this path should be ignored.
      // We check if the payload.path exactly matches or (in case of a folder delete/create) starts with the ignored path.
      const normPath = payload.path.replace(/\\/g, '/');
      const shouldIgnoreToast = ignoredWatcherPathsRef.current.some(item => {
        if (item.event !== payload.event) return false;
        return normPath === item.path || normPath.startsWith(item.path + '/');
      });

      if (!shouldIgnoreToast) {
        if (payload.event === 'create' && payload.type === 'file') {
          addToast('create-file', `Created ${payload.path.split('/').pop()}`);
        } else if (payload.event === 'create' && payload.type === 'folder') {
          addToast('create-folder', `Folder added: ${payload.path.split('/').pop()}`);
        } else if (payload.event === 'modify') {
          addToast('modify', `Modified ${payload.path.split('/').pop()}`);
        } else if (payload.event === 'delete') {
          addToast('delete', `Deleted ${payload.path.split('/').pop()}`);
        }
      }
    });

    electron.onVaultChanged(async (payload: { path: string }) => {
      await loadVaultInfo();
      const tree = await fileService.getVaultTree();
      setDirectoryTrees(tree);
      await initialVaultScan(tree);
      addToast('vault', `Vault switched to ${payload.path.split(/[\\/]/).pop()}`);
    });

    return () => {
      electron.offVaultTreeChanged();
      electron.offVaultChanged();
    };
  }, [addToast, getMdFilesFromTree, initialVaultScan, loadVaultInfo]);

  const loadTree = async () => {
    try {
      const tree = await fileService.getVaultTree();
      setDirectoryTrees(tree);
    } catch (err) {
      console.error(err);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, node: ExplorerNode) => {
    setDraggedNode(node);
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDraggedOverFolder(null);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderNode: ExplorerNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedNode) return;

    // Validation checks:
    // 1. Cannot drop onto itself
    if (draggedNode.path === folderNode.path) return;
    // 2. Cannot drop a folder into one of its subfolders
    if (draggedNode.isFolder && folderNode.path.startsWith(draggedNode.path + '/')) return;
    // 3. Cannot drop an item into its current direct parent folder
    const parts = draggedNode.path.split('/');
    parts.pop();
    const currentParentPath = parts.join('/');
    if (currentParentPath === folderNode.path) return;

    setDraggedOverFolder(folderNode.path);
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderNode: ExplorerNode) => {
    e.preventDefault();
    e.stopPropagation();
    const oldPath = e.dataTransfer.getData('text/plain') || draggedNode?.path;
    if (!oldPath) return;

    // Safety checks
    if (oldPath === folderNode.path || (draggedNode?.isFolder && folderNode.path.startsWith(oldPath + '/'))) {
      handleDragEnd();
      return;
    }

    const fileName = oldPath.split('/').pop()!;
    const newPath = `${folderNode.path}/${fileName}`;

    const res = await fileService.moveItem(oldPath, newPath);
    if (res.success) {
      ignoreWatcherToast(oldPath, 'delete');
      ignoreWatcherToast(newPath, 'create');
      addToast('modify', `Moved ${fileName} to ${folderNode.name}`);
      setExpandedFolders(prev => ({ ...prev, [folderNode.path]: true }));
    } else {
      addToast('delete', `Failed to move: ${res.error || 'Unknown error'}`);
    }
    handleDragEnd();
  };

  const handleDragOverRoot = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedNode) return;

    // If already at root, do not show highlight or allow dropping
    const isAlreadyAtRoot = !draggedNode.path.includes('/');
    if (isAlreadyAtRoot) return;

    setDraggedOverFolder('__root__');
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    const oldPath = e.dataTransfer.getData('text/plain') || draggedNode?.path;
    if (!oldPath) return;

    if (!oldPath.includes('/')) {
      handleDragEnd();
      return;
    }

    const fileName = oldPath.split('/').pop()!;
    const newPath = fileName;

    const res = await fileService.moveItem(oldPath, newPath);
    if (res.success) {
      ignoreWatcherToast(oldPath, 'delete');
      ignoreWatcherToast(newPath, 'create');
      addToast('modify', `Moved ${fileName} to Vault Root`);
    } else {
      addToast('delete', `Failed to move: ${res.error || 'Unknown error'}`);
    }
    handleDragEnd();
  };

  // Recursive render for directory tree
  const renderTree = (nodes: ExplorerNode[]) => {
    return nodes.map((node) => {
      // Inline renaming mode
      if (renamingPath === node.path) {
        const isFolder = node.isFolder;
        return (
          <div key={node.path} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 m-0.5">
            {isFolder ? (
              <Folder className="w-4 h-4 text-yellow-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-yellow-400 shrink-0 animate-pulse" />
            )}
            <input
              autoFocus
              type="text"
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename(node);
                else if (e.key === 'Escape') handleCancelRename();
              }}
              onBlur={() => handleSaveRename(node)}
              className="bg-transparent outline-none text-white text-xs w-full"
            />
          </div>
        );
      }

      // 1. Render Folder
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
              onDragLeave={() => {
                if (draggedOverFolder === node.path) setDraggedOverFolder(null);
              }}
              onDrop={(e) => handleDropOnFolder(e, node)}
              onClick={() => setExpandedFolders(prev => ({ ...prev, [node.path]: !prev[node.path] }))}
              onContextMenu={(e) => handleContextMenu(e, node)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-gray-300 transition-all duration-150 ${isDraggedOver
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-[1.02]'
                : 'hover:bg-white/5'
                }`}
            >
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <Folder className={`w-4 h-4 shrink-0 transition-colors duration-150 ${isDraggedOver ? 'text-emerald-400 fill-emerald-500/10' : 'text-blue-400 fill-blue-500/10'}`} />
              <span className="truncate">{node.name}</span>
            </div>

            {isOpen && (
              <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
                {/* Inline Creation under this Folder */}
                {creationTarget && creationTarget.parentPath === node.path && (
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
                {node.children && renderTree(node.children)}
              </div>
            )}
          </div>
        );

        // 2. Render file
      } else {
        const isActive = activeFilePath === node.path;
        return (
          <div key={node.path}>
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, node)}
              onDragEnd={handleDragEnd}
              onClick={(e) => handleSelectFile(node.path, e.ctrlKey || e.metaKey)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition ${isActive
                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300 font-medium'
                : 'hover:bg-white/5 text-gray-300'
                }`}
            >
              <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-gray-400'}`} />
              <span className="truncate">{node.name}</span>
            </div>
          </div>
        );
      }
    });
  };

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

  // Helper to save current file content
  const saveCurrentFile = async () => {
    if (activeFilePath && editorBlocks.length > 0) {
      try {
        const remainingContent = serializeBlocksToMarkdown(editorBlocks);
        const frontmatter = serializeFrontmatter(noteProperties);
        const currentContent = frontmatter + remainingContent;

        ignoreWatcherToast(activeFilePath, 'modify');
        await fileService.writeFile(activeFilePath, currentContent);

        // Sync the change in syncManager
        const allPaths = getMdFilesFromTree(directoryTrees);
        const doc = SyncManager.getInstance().handleFileChange(activeFilePath, currentContent, allPaths);
        setScanTrigger(prev => prev + 1);

        const stat = await fileService.sqliteGetSingleFileStat(activeFilePath);
        if (stat) {
          await fileService.sqliteSaveDocument(doc, stat.mtimeMs, stat.size);
        }
      } catch (err) {
        console.error('Failed to save current file:', err);
      }
    }
  };

  // Helper to save block updates directly
  const saveBlocksDirectly = async (blocksToSave: RuntimeBlock[]) => {
    if (activeFilePath) {
      try {
        const remainingContent = serializeBlocksToMarkdown(blocksToSave);
        const frontmatter = serializeFrontmatter(noteProperties);
        const currentContent = frontmatter + remainingContent;

        ignoreWatcherToast(activeFilePath, 'modify');
        await fileService.writeFile(activeFilePath, currentContent);

        // Sync the change in syncManager
        const allPaths = getMdFilesFromTree(directoryTrees);
        const doc = SyncManager.getInstance().handleFileChange(activeFilePath, currentContent, allPaths);
        setScanTrigger(prev => prev + 1);

        const stat = await fileService.sqliteGetSingleFileStat(activeFilePath);
        if (stat) {
          await fileService.sqliteSaveDocument(doc, stat.mtimeMs, stat.size);
        }
      } catch (err) {
        console.error('Failed to save blocks directly:', err);
      }
    }
  };

  // Helper to save properties updates directly
  const savePropertiesDirectly = async (updatedProperties: Record<string, any>) => {
    if (activeFilePath) {
      try {
        const remainingContent = serializeBlocksToMarkdown(editorBlocks);
        const frontmatter = serializeFrontmatter(updatedProperties);
        const currentContent = frontmatter + remainingContent;

        ignoreWatcherToast(activeFilePath, 'modify');
        await fileService.writeFile(activeFilePath, currentContent);

        // Sync the change in syncManager
        const allPaths = getMdFilesFromTree(directoryTrees);
        const doc = SyncManager.getInstance().handleFileChange(activeFilePath, currentContent, allPaths);
        setScanTrigger(prev => prev + 1);

        const stat = await fileService.sqliteGetSingleFileStat(activeFilePath);
        if (stat) {
          await fileService.sqliteSaveDocument(doc, stat.mtimeMs, stat.size);
        }
      } catch (err) {
        console.error('Failed to save properties directly:', err);
      }
    }
  };

  const handleSaveNewProperty = () => {
    // "tags" is the one fixed, vault-wide tag property. "list" is a generic
    // multi-value property whose key is user-defined and unrelated to tags.
    const key = newPropType === 'tags' ? 'tags' : newPropKey.trim();
    if (!key || noteProperties[key]) {
      setNewPropKey('');
      setNewPropType('tags');
      setIsAddingProperty(false);
      return;
    }

    const defaultValue: any[] = [];
    const updated = { ...noteProperties, [key]: defaultValue };
    setNoteProperties(updated);
    savePropertiesDirectly(updated);

    setNewPropKey('');
    setNewPropType('tags');
    setIsAddingProperty(false);
  };

  // Generic add/remove for any list-typed property value (used by both the
  // vault-wide "tags" property and standalone multi-value "list" properties).
  const handleAddListValue = (key: string, newValue: string) => {
    const trimmed = newValue.trim();
    if (!trimmed) return;

    const currentValues = Array.isArray(noteProperties[key]) ? noteProperties[key] : [];
    if (currentValues.includes(trimmed)) {
      setActiveTagInputs(prev => ({ ...prev, [key]: '' }));
      return;
    }

    const updated = {
      ...noteProperties,
      [key]: [...currentValues, trimmed]
    };
    setNoteProperties(updated);
    savePropertiesDirectly(updated);
    setActiveTagInputs(prev => ({ ...prev, [key]: '' }));
  };

  const handleRemoveListValue = (key: string, valueToRemove: string) => {
    const currentValues = Array.isArray(noteProperties[key]) ? noteProperties[key] : [];
    const updated = {
      ...noteProperties,
      [key]: currentValues.filter((t: string) => t !== valueToRemove)
    };
    setNoteProperties(updated);
    savePropertiesDirectly(updated);
  };

  // Sync blocks and properties when active note changes
  useEffect(() => {
    if (activeFilePath) {
      fileService.readFile(activeFilePath).then(content => {
        const { properties, remainingContent } = parseFrontmatter(content);
        setNoteProperties(properties);
        const blocks = extractBlocksFromMarkdown(remainingContent, activeFilePath);
        setEditorBlocks(blocks);
      });
    } else {
      setEditorBlocks([]);
      setNoteProperties({});
    }
  }, [activeFilePath]);

  // Database-driven Search Query Execution with Debounce
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
        const results = await fileService.sqliteSearchNotes(q);
        setSearchResults(results);
      } catch (err) {
        console.error("Failed executing SQLite notes search:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, scanTrigger]);

  // Handle navigation and scrolling to specific block
  const handleSelectBlock = async (filePath: string, blockId: string) => {
    await handleSelectFile(filePath);
    setPendingScrollToBlockId(blockId);
  };

  useEffect(() => {
    if (activeFilePath && pendingScrollToBlockId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(pendingScrollToBlockId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight block element visually
          element.classList.add('bg-blue-500/10', 'border-blue-500/30');
          setTimeout(() => {
            element.classList.remove('bg-blue-500/10', 'border-blue-500/30');
          }, 2000);
        }
        setPendingScrollToBlockId(null);
      }, 350); // 350ms to ensure component mounts and renders blocks
      return () => clearTimeout(timer);
    }
  }, [activeFilePath, pendingScrollToBlockId]);

  // Selecting a file with Preview & Ctrl+Click rules
  const handleSelectFile = async (path: string, isCtrlClick = false) => {
    try {
      const currentActiveTabPath = activeTabPath;

      // Save currently active file first
      await saveCurrentFile();

      const title = path.split('/').pop()?.replace('.md', '') || 'Untitled';

      setOpenTabs(prev => {
        const existingTabIdx = prev.findIndex(t => t.path === path);
        if (existingTabIdx >= 0) {
          return prev;
        }

        let newTabs = [...prev];
        if (isCtrlClick || prev.length === 0 || !currentActiveTabPath) {
          newTabs.push({ path, title });
        } else {
          const activeIdx = prev.findIndex(t => t.path === currentActiveTabPath);
          if (activeIdx >= 0) {
            newTabs[activeIdx] = { path, title };
          } else {
            newTabs.push({ path, title });
          }
        }
        return newTabs;
      });

      setActiveTabPath(path);
      setActiveFilePath(path);
      setActiveFileTitle(title);
    } catch (err) {
      console.error(err);
    }
  };

  // Tab Selection
  const handleSelectTab = async (path: string) => {
    if (path === activeTabPath) return;
    await saveCurrentFile();
    setActiveTabPath(path);
    setActiveFilePath(path);
    const title = path.split('/').pop()?.replace('.md', '') || 'Untitled';
    setActiveFileTitle(title);
  };

  // Close Tab
  const handleCloseTab = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();

    const currentActiveTabPath = activeTabPath;
    const currentOpenTabs = openTabs;

    if (path === currentActiveTabPath) {
      await saveCurrentFile();
    }

    const tabIndex = currentOpenTabs.findIndex(t => t.path === path);
    const newTabs = currentOpenTabs.filter(t => t.path !== path);
    setOpenTabs(newTabs);

    if (path === currentActiveTabPath) {
      if (newTabs.length > 0) {
        const nextActiveIdx = Math.min(tabIndex, newTabs.length - 1);
        const nextActivePath = newTabs[nextActiveIdx].path;
        setActiveTabPath(nextActivePath);
        setActiveFilePath(nextActivePath);
        const title = nextActivePath.split('/').pop()?.replace('.md', '') || 'Untitled';
        setActiveFileTitle(title);
      } else {
        setActiveTabPath(null);
        setActiveFilePath(null);
        setActiveFileTitle('Untitled');
      }
    }
  };

  // Wikilink click navigator and creator
  const handleWikilinkClick = async (target: string) => {
    const allPaths = getMdFilesFromTree(directoryTrees);
    const resolved = resolveLinkPath(target, activeFilePath || '', allPaths);

    if (resolved) {
      handleSelectFile(resolved);
    } else {
      const name = target.trim();
      const relativePath = name.endsWith('.md') ? name : `${name}.md`;
      const confirmCreate = window.confirm(`Note "${name}" does not exist. Do you want to create it?`);
      if (!confirmCreate) return;

      try {
        ignoreWatcherToast(relativePath, 'create');
        await fileService.createFile(relativePath, `# ${name.split('/').pop()?.replace('.md', '')}\n\n`);
        addToast('create-file', `Auto-created note: ${relativePath}`);

        // Pre-cache in SyncManager
        const syncManager = SyncManager.getInstance();
        const updatedAllPaths = [...allPaths, relativePath];
        syncManager.handleFileChange(relativePath, `# ${name.split('/').pop()?.replace('.md', '')}\n\n`, updatedAllPaths);

        await loadTree();
        await handleSelectFile(relativePath);
      } catch (err) {
        console.error('Failed to auto-create note via wikilink:', err);
        addToast('delete', `Failed to create note: ${name}`);
      }
    }
  };

  const handleHashtagClick = (tag: string) => {
    setActiveSidebarTab('search');
    setSearchQuery(`#${tag}`);
  };



  // Sync tabs and paths after renaming files/folders
  const updateTabsAfterRename = (oldPath: string, newPath: string) => {
    setOpenTabs(prev => prev.map(tab => {
      if (tab.path === oldPath) {
        const title = newPath.split('/').pop()?.replace('.md', '') || 'Untitled';
        return { path: newPath, title };
      } else if (tab.path.startsWith(oldPath + '/')) {
        const suffix = tab.path.slice(oldPath.length);
        const nextPath = newPath + suffix;
        return { ...tab, path: nextPath };
      }
      return tab;
    }));

    const updatePath = (prev: string | null) => {
      if (prev === oldPath) return newPath;
      if (prev?.startsWith(oldPath + '/')) {
        return newPath + prev.slice(oldPath.length);
      }
      return prev;
    };

    setActiveTabPath(prev => updatePath(prev));
    setActiveFilePath(prev => {
      const updated = updatePath(prev);
      if (updated && updated !== prev) {
        fileService.readFile(updated).then(content => {
          if (contentRef.current) contentRef.current.innerText = content;
        });
      }
      return updated;
    });
  };

  // Close tabs after delete
  const closeTabsAfterDelete = async (deletedPath: string) => {
    const tabsToKeep = openTabs.filter(tab => tab.path !== deletedPath && !tab.path.startsWith(deletedPath + '/'));
    const isCurrentClosed = activeTabPath === deletedPath || (activeTabPath?.startsWith(deletedPath + '/') ?? false);

    setOpenTabs(tabsToKeep);

    if (isCurrentClosed) {
      if (tabsToKeep.length > 0) {
        const nextActivePath = tabsToKeep[0].path;
        setActiveTabPath(nextActivePath);
        setActiveFilePath(nextActivePath);
        const content = await fileService.readFile(nextActivePath);
        const title = nextActivePath.split('/').pop()?.replace('.md', '') || 'Untitled';
        setActiveFileTitle(title);
        if (contentRef.current) {
          contentRef.current.innerText = content;
        }
      } else {
        setActiveTabPath(null);
        setActiveFilePath(null);
        setActiveFileTitle('Untitled');
        if (contentRef.current) {
          contentRef.current.innerText = '';
        }
      }
    }
  };

  // Context Menu activation
  const handleContextMenu = (e: React.MouseEvent, node: ExplorerNode | null) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 160;
    const menuHeight = 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({
      visible: true,
      x,
      y,
      node,
      type: 'node'
    });
  };

  const handleVaultContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 160;
    const menuHeight = 100;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({
      visible: true,
      x,
      y,
      node: null,
      type: 'vault'
    });
  };

  const handleClearVault = async () => {
    try {
      // @ts-ignore
      if (window.electron && window.electron.clearVault) {
        // @ts-ignore
        await window.electron.clearVault();
      }
      setVaultInfo(null);
      setDirectoryTrees([]);
      setActiveFilePath(null);
      setActiveFileTitle('Untitled');
      if (contentRef.current) {
        contentRef.current.innerText = '';
      }
    } catch (err) {
      console.error('Failed to clear vault config:', err);
    }
  };

  // Inline Creation Handlers
  const handleCreateFile = () => {
    setCreationTarget({ parentPath: null, isFile: true });
    setNewItemName('');
  };

  const handleCreateFolder = () => {
    setCreationTarget({ parentPath: null, isFile: false });
    setNewItemName('');
  };

  // Save new item (File/Folder)
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

  const handleCancelNewItem = () => {
    setCreationTarget(null);
    setNewItemName('');
  };

  // Save renamed item
  const handleSaveRename = async (node: ExplorerNode) => {
    const newName = renamingName.trim();
    if (!newName || newName === node.name) {
      handleCancelRename();
      return;
    }

    const parts = node.path.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    try {
      const res = await fileService.moveItem(node.path, newPath);
      if (res.success) {
        ignoreWatcherToast(node.path, 'delete');
        ignoreWatcherToast(newPath, 'create');
        updateTabsAfterRename(node.path, newPath);

        const updatedAllPaths = allPaths.map(p => p === node.path ? newPath : p);
        await refactorLinksOnRename(node.path, newPath, updatedAllPaths);

        addToast('modify', `Renamed ${node.name} to ${newName}`);
        await loadTree();
      } else {
        addToast('delete', `Failed to rename: ${res.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      handleCancelRename();
    }
  };

  const handleSaveTitleRename = async () => {
    if (!activeFilePath) return;
    const newTitle = activeFileTitle.trim();
    const oldFileName = activeFilePath.split('/').pop()?.replace(/\.md$/i, '') || '';
    
    if (!newTitle || newTitle === oldFileName) {
      setActiveFileTitle(oldFileName);
      return;
    }
    
    const parts = activeFilePath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    const newPath = parentPath ? `${parentPath}/${newTitle}.md` : `${newTitle}.md`;

    try {
      const res = await fileService.moveItem(activeFilePath, newPath);
      if (res.success) {
        ignoreWatcherToast(activeFilePath, 'delete');
        ignoreWatcherToast(newPath, 'create');
        updateTabsAfterRename(activeFilePath, newPath);

        const updatedAllPaths = allPaths.map(p => p === activeFilePath ? newPath : p);
        await refactorLinksOnRename(activeFilePath, newPath, updatedAllPaths);

        addToast('modify', `Renamed ${oldFileName} to ${newTitle}`);
        await loadTree();
      } else {
        addToast('delete', `Failed to rename: ${res.error || 'Unknown error'}`);
        setActiveFileTitle(oldFileName);
      }
    } catch (err) {
      console.error(err);
      setActiveFileTitle(oldFileName);
    }
  };

  const handleCancelRename = () => {
    setRenamingPath(null);
    setRenamingName('');
  };

  // Delete item
  const handleDeleteItem = async (node: ExplorerNode) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${node.name}"?`);
    if (!confirmDelete) return;

    try {
      const res = await fileService.deleteItem(node.path);
      if (res.success) {
        ignoreWatcherToast(node.path, 'delete');
        await closeTabsAfterDelete(node.path);
        addToast('delete', `Deleted ${node.name}`);
        await loadTree();
      } else {
        addToast('delete', `Failed to delete: ${res.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Move file or folder to a target path
  const handleMoveNodeTo = async (node: ExplorerNode, targetFolderPath: string) => {
    const oldPath = node.path;
    const fileName = oldPath.split('/').pop()!;
    const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;

    try {
      const res = await fileService.moveItem(oldPath, newPath);
      if (res.success) {
        ignoreWatcherToast(oldPath, 'delete');
        ignoreWatcherToast(newPath, 'create');
        updateTabsAfterRename(oldPath, newPath);

        const updatedAllPaths = getMdFilesFromTree(directoryTrees).map(p => p === oldPath ? newPath : p);
        await refactorLinksOnRename(oldPath, newPath, updatedAllPaths);

        addToast('modify', `Moved ${fileName} to ${targetFolderPath ? targetFolderPath.split('/').pop() : 'Vault Root'}`);
        await loadTree();

        if (targetFolderPath) {
          setExpandedFolders(prev => ({ ...prev, [targetFolderPath]: true }));
        }
      } else {
        addToast('delete', `Failed to move: ${res.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(error);
      addToast('delete', `Failed to move: ${String(error)}`);
    }
  };





  const toastIcon = (type: ToastType) => {
    if (type === 'create-file') return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (type === 'create-folder') return <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />;
    if (type === 'modify') return <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />;
    if (type === 'delete') return <Trash2 className="w-4 h-4 text-red-400 shrink-0" />;
    return <FolderOpen className="w-4 h-4 text-purple-400 shrink-0" />;
  };

  // Structured Knowledge calculations for rendering
  const syncManager = SyncManager.getInstance();
  const queryEngine = KnowledgeQueryEngine.getInstance();

  const allPaths = getMdFilesFromTree(directoryTrees);
  const activeDoc = useMemo(() => activeFilePath ? syncManager.getDocument(activeFilePath) : null, [activeFilePath, scanTrigger]);
  const docTags = activeDoc ? activeDoc.tags : [];

  const allVaultTags = useMemo(() => {
    const docs = syncManager.getAllDocuments();
    const tags = new Set<string>();
    for (const doc of docs) {
      for (const t of doc.tags) {
        tags.add(t);
      }
    }
    return Array.from(tags);
  }, [scanTrigger, directoryTrees]);

  // Suggestions for a generic multi-list property come only from prior values
  // used under the *same property key* across the vault - never from the tag index.
  const getValuesForListKey = useCallback((key: string): string[] => {
    const docs = syncManager.getAllDocuments();
    const values = new Set<string>();
    for (const doc of docs) {
      const val = doc.properties?.[key];
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === 'string') values.add(v);
        }
      }
    }
    return Array.from(values);
  }, [scanTrigger, directoryTrees]);

  // Get all folders from directory trees in tree order
  const allFolders = useMemo(() => {
    const list: { path: string; name: string }[] = [];
    const traverse = (nodes: ExplorerNode[]) => {
      for (const node of nodes) {
        if (node.isFolder) {
          list.push({ path: node.path, name: node.name });
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    };
    traverse(directoryTrees);
    return list;
  }, [directoryTrees]);

  // Combine folders with the Vault Root
  const choices = useMemo(() => {
    return [{ path: '', name: 'Vault Root' }, ...allFolders];
  }, [allFolders]);

  // Filter folder choices based on the search query
  const filteredChoices = useMemo(() => {
    const query = moveSearchQuery.trim().toLowerCase();
    if (!query) return choices;
    return choices.filter(choice => {
      if (choice.path === '') {
        return 'vault root'.includes(query);
      }
      return choice.path.toLowerCase().includes(query) || choice.name.toLowerCase().includes(query);
    });
  }, [choices, moveSearchQuery]);

  const mentions = useMemo(() => activeFilePath ? queryEngine.getLinkedMentions(activeFilePath, allPaths) : [], [activeFilePath, allPaths, scanTrigger]);


  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f1117] text-gray-200 font-sans select-none">
      {/* Toast Notifications */}
      <div className="fixed top-14 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#1c1f2a] border border-white/10 shadow-xl text-sm text-gray-200 animate-in slide-in-from-top-2 pointer-events-auto"
          >
            {toastIcon(toast.type)}
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-1 text-gray-500 hover:text-white transition border-0 outline-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      {/* Hidden Native-like Titlebar */}
      <div className="h-10 drag-region bg-[#0f1117] border-b border-white/5 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2 no-drag">
          <button
            onClick={handleClose}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition cursor-pointer border-0 outline-none"
            title="Close"
          />
          <button
            onClick={handleMinimize}
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition cursor-pointer border-0 outline-none"
            title="Minimize"
          />
          <button
            onClick={handleMaximize}
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition cursor-pointer border-0 outline-none"
            title="Maximize"
          />
        </div>

        <div className="mx-auto text-xs tracking-widest uppercase text-gray-500 pr-10">
          Vault Workspace
        </div>
      </div>

      {/* APP */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-72 bg-[#13161d] border-r border-white/5 flex flex-col shrink-0">
          {isLoadingVault ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
              Loading Vault...
            </div>
          ) : vaultInfo?.vaultPath ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Tab Selector */}
              <div className="flex border-b border-white/5 shrink-0 select-none">
                <button
                  onClick={() => setActiveSidebarTab('explorer')}
                  className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 outline-none cursor-pointer text-center ${
                    activeSidebarTab === 'explorer'
                      ? 'border-blue-500 text-white bg-white/[0.02]'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Explorer
                </button>
                <button
                  onClick={() => setActiveSidebarTab('search')}
                  className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 outline-none cursor-pointer text-center ${
                    activeSidebarTab === 'search'
                      ? 'border-blue-500 text-white bg-white/[0.02]'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Search
                </button>
              </div>

              {activeSidebarTab === 'explorer' ? (
                /* Explorer */
                <div
                  onDragOver={handleDragOverRoot}
                  onDragLeave={() => {
                    if (draggedOverFolder === '__root__') setDraggedOverFolder(null);
                  }}
                  onDrop={handleDropOnRoot}
                  onContextMenu={(e) => handleContextMenu(e, null)}
                  className={`flex-1 overflow-auto p-3 transition-all duration-200 ${draggedOverFolder === '__root__' ? 'bg-blue-500/5 border border-dashed border-blue-500/30 rounded-xl m-1' : ''
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-widest text-gray-500">Explorer</span>
                    <button
                      onClick={loadTree}
                      className="text-gray-500 hover:text-white transition cursor-pointer border-0 outline-none"
                      title="Refresh Explorer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Create file/folder buttons */}
                  <div className="flex items-center justify-center mb-3 gap-4 bg-white/5 py-1.5 rounded-lg">
                    <button
                      className="text-gray-400 hover:text-white transition cursor-pointer border-0 outline-none flex items-center gap-1.5 text-xs font-medium"
                      onClick={handleCreateFile}
                      title="Create File"
                    >
                      <File className="w-4 h-4" />
                      <span>New File</span>
                    </button>
                    <div className="w-px h-3 bg-white/10" />
                    <button
                      className="text-gray-400 hover:text-white transition cursor-pointer border-0 outline-none flex items-center gap-1.5 text-xs font-medium"
                      onClick={handleCreateFolder}
                      title="Create Folder"
                    >
                      <Folder className="w-4 h-4" />
                      <span>New Folder</span>
                    </button>
                  </div>

                  {/* Dynamic Tree Directory */}
                  <div className="space-y-1 text-sm">
                    {/* Inline root creation */}
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
                    {renderTree(directoryTrees)}
                  </div>
                </div>
              ) : (
                /* Search Tab UI */
                <div className="flex-1 flex flex-col p-3 overflow-hidden">
                  {/* Search Input Box */}
                  <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-blue-500/50 transition">
                    <Search className="w-4 h-4 text-gray-500 shrink-0 mr-2" />
                    <input
                      type="text"
                      placeholder="Search notes, blocks, tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent text-xs text-white outline-none w-full pr-6"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 text-gray-500 hover:text-white p-0.5 border-0 bg-transparent cursor-pointer outline-none"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* All Vault Tags list (Quick tag filter) */}
                  {allVaultTags.length > 0 && (
                    <div className="mt-3 shrink-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Quick Tag Filter
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pb-1">
                        {allVaultTags.map(tag => {
                          const isSelected = searchQuery.includes(`#${tag}`);
                          return (
                            <span
                              key={tag}
                              onClick={() => {
                                if (isSelected) {
                                  setSearchQuery(prev => prev.replace(`#${tag}`, '').trim());
                                } else {
                                  setSearchQuery(prev => `${prev} #${tag}`.trim());
                                }
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition select-none ${
                                isSelected
                                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              #{tag}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Results list */}
                  <div className="flex-1 overflow-y-auto mt-4 space-y-3.5 pr-0.5">
                    {isSearching ? (
                      <div className="text-center py-6 text-xs text-gray-500 flex items-center justify-center gap-1.5">
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching SQLite database...</span>
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((result) => {
                        const noteTitle = result.title;
                        const matchCount = result.matchingBlocks?.length || 0;

                        return (
                          <div key={result.path} className="space-y-1 bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 rounded-xl p-2.5 transition">
                            {/* Note Title Link */}
                            <div
                              onClick={() => handleSelectFile(result.path)}
                              className="flex items-center justify-between text-xs font-semibold text-white cursor-pointer group/title"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="truncate group-hover/title:text-blue-300 transition" title={result.path}>
                                  {noteTitle}
                                </span>
                              </div>
                              {matchCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-[9px] text-blue-400 font-bold shrink-0">
                                  {matchCount}
                                </span>
                              )}
                            </div>
                            
                            {/* Note Tags (if any) */}
                            {result.tags && result.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 pl-5.5">
                                {result.tags.map((t: string) => (
                                  <span key={t} className="text-[9px] text-emerald-400/80 font-mono">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Nested Matching Blocks */}
                            {matchCount > 0 && (
                              <div className="mt-2 pl-4 border-l border-white/5 space-y-2">
                                {result.matchingBlocks.map((block: any) => (
                                  <div
                                    key={block.id}
                                    onClick={() => handleSelectBlock(result.path, block.id)}
                                    className="p-1.5 rounded-lg bg-[#181b24]/50 hover:bg-[#1e2230] cursor-pointer transition text-[11px] text-gray-400 hover:text-white text-left font-sans select-none border border-transparent hover:border-white/5"
                                  >
                                    <div className="text-[9px] text-gray-600 font-mono flex items-center justify-between mb-0.5">
                                      <span className="capitalize">{block.type}</span>
                                      <span>Line {block.metadata.lineStart}</span>
                                    </div>
                                    <div className="truncate italic">
                                      <HighlightQueryText text={block.content || ''} query={searchQuery} />
                                    </div>
                                    {/* Block-level tags */}
                                    {block.metadata.tags && block.metadata.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {block.metadata.tags.map((t: string) => (
                                          <span key={t} className="px-1.5 py-0.2 bg-emerald-500/10 border border-emerald-500/20 text-[8px] text-emerald-400 rounded-full font-mono font-semibold">
                                            #{t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : searchQuery.trim() ? (
                      <div className="text-center py-6 text-xs text-gray-500">
                        No matches found.
                      </div>
                    ) : (
                      <div className="text-center py-8 text-xs text-gray-500 flex flex-col items-center justify-center gap-2">
                        <Search className="w-8 h-8 text-gray-600 mb-1" />
                        <p className="font-semibold text-gray-400">Search Vault</p>
                        <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed mx-auto">
                          Enter keywords or tags (e.g. <span className="text-blue-400">#notes</span>) to query the database.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Open Vault display replacing renderTree */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <FolderOpen className="w-12 h-12 text-blue-500/60 mb-4 animate-bounce duration-1000" />
              <h3 className="text-sm font-semibold text-white mb-2">No Vault Open</h3>
              <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                Open a folder to use it as your note vault workspace.
              </p>
              <button
                onClick={handleSelectVault}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 transition text-xs font-semibold text-white cursor-pointer border-0 outline-none shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                Open Vault
              </button>
            </div>
          )}

          {/* Vault Footer Info */}
          {!isLoadingVault && vaultInfo?.vaultPath && (
            <div 
              className="p-4 border-t border-white/5 cursor-context-menu"
              onContextMenu={handleVaultContextMenu}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-sm font-semibold text-white truncate max-w-[180px]">
                    {vaultInfo?.name || 'Loading...'}
                  </h1>
                  <p
                    className="text-xs text-gray-500 mt-1 truncate max-w-[180px] cursor-pointer hover:text-gray-300 transition"
                    title={vaultInfo?.vaultPath}
                    onClick={handleSelectVault}
                  >
                    {vaultInfo?.vaultPath || 'No vault path'}
                  </p>
                </div>
                <button
                  onClick={handleSelectVault}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-gray-400 cursor-pointer border-0 outline-none"
                  title="Open another folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col bg-[#0f1117] overflow-hidden">
          {/* Welcome / Toolbar */}
          {!isLoadingVault && !vaultInfo?.vaultPath && (
            <div className="border-b border-white/5 px-8 py-5 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Welcome to Your Vault</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Select a folder or click "+" to open a different vault directory.
                  </p>
                </div>

                <button
                  onClick={handleSelectVault}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 transition text-sm font-medium shadow-lg shadow-blue-500/20 cursor-pointer border-0 outline-none"
                >
                  Open Vault
                </button>
              </div>
            </div>
          )}

          {/* Tabs Bar */}
          {openTabs.length > 0 && (
            <div className="flex items-center gap-1 bg-[#0a0c10] p-2 overflow-x-auto border-b border-white/5 shrink-0 select-none">
              {openTabs.map((tab) => {
                const isActive = tab.path === activeTabPath;
                return (
                  <div
                    key={tab.path}
                    onClick={() => handleSelectTab(tab.path)}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 relative ${isActive
                      ? 'bg-[#0f1117] text-white border-b-2 border-blue-500 shadow-md'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}
                  >
                    <FileText className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-gray-600'}`} />
                    <span className="max-w-[120px] truncate">{tab.title}</span>
                    <button
                      onClick={(e) => handleCloseTab(e, tab.path)}
                      className="p-0.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition border-0 outline-none cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 overflow-auto px-12 py-10">
            <div className="max-w-4xl mx-auto">
              {/* Title Header */}
              <div className="flex justify-between items-start gap-4">
                <input
                  type="text"
                  value={activeFileTitle}
                  onChange={(e) => setActiveFileTitle(e.target.value)}
                  onBlur={handleSaveTitleRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      const oldFileName = activeFilePath?.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled';
                      setActiveFileTitle(oldFileName);
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full bg-transparent outline-none text-5xl font-bold text-white placeholder-gray-600"
                  placeholder="Untitled"
                  disabled={!activeFilePath}
                />
              </div>

              {/* Properties Editor Panel */}
              {activeFilePath && (
                <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" /> Note Properties
                    </span>
                    <button
                      onClick={() => {
                        setNewPropType(noteProperties['tags'] ? 'list' : 'tags');
                        setIsAddingProperty(true);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 transition rounded text-[10px] font-semibold text-white border-0 outline-none cursor-pointer"
                    >
                      + Add Property
                    </button>
                  </div>
                  
                  {isAddingProperty && (
                    <div className="flex gap-2 items-center text-xs bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-2 animate-in fade-in slide-in-from-top-1">
                      <select
                        autoFocus
                        value={newPropType}
                        onChange={(e) => setNewPropType(e.target.value as 'tags' | 'list')}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsAddingProperty(false);
                            setNewPropKey('');
                            setNewPropType('tags');
                          }
                        }}
                        className="bg-[#13161d] border border-white/10 rounded px-2.5 py-1 text-gray-300 outline-none focus:border-blue-500/50 text-xs w-32"
                      >
                        <option value="tags" disabled={!!noteProperties['tags']}>tag</option>
                        <option value="list">multi-list</option>
                      </select>
                      {newPropType === 'list' && (
                        <input
                          autoFocus
                          type="text"
                          placeholder="Property name..."
                          value={newPropKey}
                          onChange={(e) => setNewPropKey(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNewProperty();
                            else if (e.key === 'Escape') {
                              setIsAddingProperty(false);
                              setNewPropKey('');
                              setNewPropType('tags');
                            }
                          }}
                          className="bg-[#13161d] border border-white/10 rounded px-2.5 py-1 text-gray-300 outline-none focus:border-blue-500/50 text-xs w-40"
                        />
                      )}
                      <button
                        onClick={handleSaveNewProperty}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 transition rounded text-[10px] font-semibold text-white border-0 outline-none cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingProperty(false);
                          setNewPropKey('');
                          setNewPropType('tags');
                        }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 transition rounded text-[10px] text-gray-400 border-0 outline-none cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {Object.keys(noteProperties).length === 0 ? (
                    <div className="text-xs text-gray-500 italic">No properties added yet. Click "+ Add Property" to add note metadata.</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5 items-center text-xs">
                      {Object.entries(noteProperties).map(([key, value]) => {
                        // "tags" is the single vault-wide tag property (feeds the tag graph).
                        // Any other array-valued property is a standalone "list" - its values
                        // are scoped to that property key only, never mixed with tags.
                        let propType = 'text';
                        if (key === 'tags') {
                          propType = 'tag-list';
                        } else if (Array.isArray(value)) {
                          propType = 'list';
                        } else if (typeof value === 'boolean') {
                          propType = 'checkbox';
                        } else if (typeof value === 'number') {
                          propType = 'number';
                        } else if (
                          key.includes('date') ||
                          key === 'created' ||
                          key === 'modified' ||
                          (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
                        ) {
                          propType = 'date';
                        }

                        return (
                          <React.Fragment key={key}>
                            {/* Property Name */}
                            <div className="flex items-center justify-between text-gray-400 font-medium pr-2 border-r border-white/5 truncate" title={key}>
                              <span className="capitalize">{key}</span>
                              <button
                                onClick={() => {
                                  const confirmDelete = window.confirm(`Remove property "${key}"?`);
                                  if (confirmDelete) {
                                    const updated = { ...noteProperties };
                                    delete updated[key];
                                    setNoteProperties(updated);
                                    savePropertiesDirectly(updated);
                                  }
                                }}
                                className="text-gray-500 hover:text-red-400 transition ml-1 cursor-pointer border-0 bg-transparent text-[10px] font-bold"
                                title="Delete Property"
                              >
                                ✕
                              </button>
                            </div>
                            
                            {/* Property Value */}
                            <div className="col-span-2 flex gap-1 items-center">
                              {(propType === 'tag-list' || propType === 'list') ? (() => {
                                const isTagList = propType === 'tag-list';
                                const suggestionSource = isTagList ? allVaultTags : getValuesForListKey(key);
                                const currentValues: string[] = Array.isArray(value) ? value : [];
                                const filteredSuggestions = suggestionSource.filter(t => {
                                  if (currentValues.includes(t)) return false;
                                  const query = (activeTagInputs[key] || '').toLowerCase();
                                  return t.toLowerCase().includes(query);
                                });

                                return (
                                  <div className="relative flex flex-wrap gap-1 items-center w-full min-h-[32px] bg-white/5 border border-white/10 rounded px-2 py-1.5 focus-within:border-blue-500/50">
                                    {/* Value Badges */}
                                    {currentValues.map((item: string) => (
                                      <span
                                        key={item}
                                        className={isTagList
                                          ? "flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-300"
                                          : "flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-gray-300"}
                                      >
                                        {isTagList ? `#${item}` : item}
                                        <button
                                          onClick={() => handleRemoveListValue(key, item)}
                                          className="hover:text-red-400 font-bold ml-0.5 cursor-pointer border-0 bg-transparent text-[10px] text-gray-500"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ))}

                                    {/* Inline Input */}
                                    <input
                                      type="text"
                                      placeholder={isTagList ? "+ Add tag..." : "+ Add value..."}
                                      value={activeTagInputs[key] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setActiveTagInputs(prev => ({ ...prev, [key]: val }));
                                        setShowTagSuggestions(prev => ({ ...prev, [key]: true }));
                                      }}
                                      onFocus={() => {
                                        setFocusedPropertyInputKey(key);
                                        setShowTagSuggestions(prev => ({ ...prev, [key]: true }));
                                      }}
                                      onBlur={() => {
                                        setTimeout(() => {
                                          const val = activeTagInputs[key];
                                          if (val && val.trim()) {
                                            handleAddListValue(key, val);
                                          }
                                          setShowTagSuggestions(prev => ({ ...prev, [key]: false }));
                                          setFocusedPropertyInputKey(null);
                                        }, 200);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const val = activeTagInputs[key];
                                          if (val && val.trim()) {
                                            handleAddListValue(key, val);
                                          }
                                        }
                                      }}
                                      className="flex-1 bg-transparent text-white outline-none min-w-[60px] text-xs border-none p-0"
                                    />

                                    {/* Dropdown suggestions */}
                                    {focusedPropertyInputKey === key && showTagSuggestions[key] && filteredSuggestions.length > 0 && (
                                      <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-[#1a1d26]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-1 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                                        {filteredSuggestions.slice(0, 5).map(suggestion => (
                                          <div
                                            key={suggestion}
                                            onMouseDown={(e) => {
                                              e.preventDefault(); // Prevents blur on input
                                              handleAddListValue(key, suggestion);
                                            }}
                                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer text-gray-300 hover:bg-white/5 hover:text-white text-left truncate"
                                          >
                                            {isTagList ? `#${suggestion}` : suggestion}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })() : propType === 'checkbox' ? (
                                <input
                                  type="checkbox"
                                  checked={!!value}
                                  onChange={(e) => {
                                    const updated = {
                                      ...noteProperties,
                                      [key]: e.target.checked
                                    };
                                    setNoteProperties(updated);
                                    savePropertiesDirectly(updated);
                                  }}
                                  className="w-4 h-4 rounded bg-[#13161d] border border-white/10 text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
                                />
                              ) : propType === 'date' ? (
                                <input
                                  type="date"
                                  value={value || ''}
                                  onChange={(e) => {
                                    const updated = {
                                      ...noteProperties,
                                      [key]: e.target.value
                                    };
                                    setNoteProperties(updated);
                                    savePropertiesDirectly(updated);
                                  }}
                                  className="bg-[#13161d] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-blue-500/50 text-xs w-full"
                                />
                              ) : propType === 'number' ? (
                                <input
                                  type="number"
                                  value={value === undefined || value === null ? '' : value}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? '' : Number(e.target.value);
                                    const updated = {
                                      ...noteProperties,
                                      [key]: val
                                    };
                                    setNoteProperties(updated);
                                    savePropertiesDirectly(updated);
                                  }}
                                  className="w-full bg-[#13161d] border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-blue-500/50"
                                />
                              ) : (
                                <input
                                  type="text"
                                  placeholder={`Enter ${key}...`}
                                  value={value || ''}
                                  onChange={(e) => {
                                    const updated = {
                                      ...noteProperties,
                                      [key]: e.target.value
                                    };
                                    setNoteProperties(updated);
                                    savePropertiesDirectly(updated);
                                  }}
                                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none focus:border-blue-500/50"
                                />
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 border-b border-white/5 pb-4 mb-6">
                <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />#notes</span>
                <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />#knowledge</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {activeFilePath ? 'Active Document' : 'No active file'}
                </span>
              </div>

              {/* Content Editor area */}
              {activeFilePath ? (
                <BlockEditor
                  blocks={editorBlocks}
                  onChange={(updatedBlocks) => {
                    setEditorBlocks(updatedBlocks);
                    saveBlocksDirectly(updatedBlocks);
                  }}
                  onWikilinkClick={handleWikilinkClick}
                  onHashtagClick={handleHashtagClick}
                  resolveLinkPath={(target) => {
                    const allPaths = getMdFilesFromTree(directoryTrees);
                    return resolveLinkPath(target, activeFilePath || '', allPaths);
                  }}
                  allPaths={allPaths}
                />
              ) : (
                <div className="mt-6 min-h-[500px] text-[16px] leading-8 text-gray-500 italic text-left select-none">
                  No note selected. Select a note from the file explorer on the left or create a new file to start writing.
                </div>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="w-80 bg-[#13161d] border-l border-white/5 flex flex-col shrink-0">
          {/* Header */}
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm uppercase tracking-widest text-gray-500">Properties</h3>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {/* Tags */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {docTags.length > 0 ? (
                  docTags.map(tag => (
                    <span
                      key={tag}
                      onClick={() => handleHashtagClick(tag)}
                      className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 cursor-pointer hover:bg-emerald-500/20 transition"
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500 italic">No tags in this note</span>
                )}
              </div>
            </div>

            {/* Properties */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Metadata
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Words</span>
                  <span className="text-gray-300 font-semibold">{activeDoc?.wordCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Characters</span>
                  <span className="text-gray-300 font-semibold">{activeDoc?.charCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Path</span>
                  <span className="truncate max-w-[150px] text-gray-300" title={activeFilePath || ''}>
                    {activeFilePath || 'None'}
                  </span>
                </div>
              </div>
            </div>

            {/* Backlinks */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> Backlinks
              </h4>
              <div className="space-y-2">
                {mentions.length > 0 ? (
                  mentions.map((mention, idx) => {
                    const sourceFileTitle = mention.sourceFile.split('/').pop()?.replace('.md', '') || 'Untitled';
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectFile(mention.sourceFile)}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition flex flex-col border border-white/5"
                      >
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                          <span>{sourceFileTitle}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1.5 pl-5 border-l border-blue-500/20 py-0.5 truncate italic text-left">
                          {mention.block.content}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <span className="text-xs text-gray-500 italic">No backlinks referencing this note</span>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[160px] bg-[#1a1d26]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'vault' ? (
            <>
              <button
                onClick={() => {
                  handleSelectVault();
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition border-0 outline-none text-left w-full cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                <span>Change Vault</span>
              </button>
              <button
                onClick={async () => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (confirm("Are you sure you want to clear the vault configuration? This will reset the app state.")) {
                    await handleClearVault();
                  }
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition border-0 outline-none text-left w-full cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Vault</span>
              </button>
            </>
          ) : (
            <>
              {(!contextMenu.node || contextMenu.node.isFolder) && (
                <>
                  <button
                    onClick={() => {
                      const targetNode = contextMenu.node;
                      setCreationTarget({ parentPath: targetNode ? targetNode.path : null, isFile: true });
                      setNewItemName('');
                      if (targetNode) {
                        setExpandedFolders(prev => ({ ...prev, [targetNode.path]: true }));
                      }
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition border-0 outline-none text-left w-full cursor-pointer"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-blue-400" />
                    <span>New File</span>
                  </button>
                  <button
                    onClick={() => {
                      const targetNode = contextMenu.node;
                      setCreationTarget({ parentPath: targetNode ? targetNode.path : null, isFile: false });
                      setNewItemName('');
                      if (targetNode) {
                        setExpandedFolders(prev => ({ ...prev, [targetNode.path]: true }));
                      }
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition border-0 outline-none text-left w-full cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>New Folder</span>
                  </button>
                </>
              )}

              {contextMenu.node && (
                <>
                  {contextMenu.node.isFolder && <div className="h-px bg-white/5 my-0.5" />}
                  <button
                    onClick={() => {
                      const node = contextMenu.node!;
                      setRenamingPath(node.path);
                      setRenamingName(node.name);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition border-0 outline-none text-left w-full cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Rename</span>
                  </button>
                  <button
                    onClick={() => {
                      const node = contextMenu.node!;
                      setMovingNode(node);
                      setMoveSearchQuery('');
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition border-0 outline-none text-left w-full cursor-pointer"
                  >
                    <Move className="w-3.5 h-3.5 text-blue-400" />
                    <span>Move to...</span>
                  </button>
                  <button
                    onClick={() => {
                      const node = contextMenu.node!;
                      handleDeleteItem(node);
                      setContextMenu(prev => ({ ...prev, visible: false }));
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition border-0 outline-none text-left w-full cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Move File/Folder Modal */}
      {movingNode && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onClick={() => setMovingNode(null)}
        >
          <div 
            className="bg-[#1a1d26] border border-white/10 shadow-2xl rounded-2xl max-w-md w-full flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Move className="w-4 h-4 text-blue-400" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">Move to...</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[280px]">
                    Moving <span className="text-gray-300 font-medium">{movingNode.name}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setMovingNode(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition border-0 outline-none cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-white/5 bg-[#13161d]/50">
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-blue-500/50 transition">
                <Search className="w-3.5 h-3.5 text-gray-500 shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search target folder..."
                  value={moveSearchQuery}
                  onChange={e => setMoveSearchQuery(e.target.value)}
                  className="bg-transparent text-white text-xs outline-none w-full placeholder:text-gray-500"
                  autoFocus
                />
                {moveSearchQuery && (
                  <button 
                    onClick={() => setMoveSearchQuery('')}
                    className="text-gray-500 hover:text-white transition border-0 outline-none cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {filteredChoices.map((choice) => {
                const getParentPath = (p: string) => {
                  const parts = p.split('/');
                  parts.pop();
                  return parts.join('/');
                };
                const currentParentPath = getParentPath(movingNode.path);
                const isCurrentParent = currentParentPath === choice.path;
                const isItself = movingNode.isFolder && movingNode.path === choice.path;
                const isSubfolder = movingNode.isFolder && choice.path.startsWith(movingNode.path + '/');
                const isDisabled = isCurrentParent || isItself || isSubfolder;

                return (
                  <button
                    key={choice.path || '__root__'}
                    disabled={isDisabled}
                    onClick={() => {
                      handleMoveNodeTo(movingNode, choice.path);
                      setMovingNode(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition text-xs border-0 outline-none ${
                      isDisabled 
                        ? 'opacity-40 cursor-not-allowed text-gray-500 bg-transparent' 
                        : 'text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className={`w-3.5 h-3.5 shrink-0 ${isDisabled ? 'text-gray-600' : 'text-blue-400'}`} />
                      <span className="truncate font-medium">
                        {choice.path === '' ? 'Vault Root' : choice.path}
                      </span>
                    </div>
                    {isCurrentParent && (
                      <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                        Current
                      </span>
                    )}
                    {isItself && (
                      <span className="text-[10px] text-yellow-500 bg-yellow-500/5 px-2 py-0.5 rounded-full shrink-0">
                        Itself
                      </span>
                    )}
                    {isSubfolder && (
                      <span className="text-[10px] text-red-500 bg-red-500/5 px-2 py-0.5 rounded-full shrink-0">
                        Subfolder
                      </span>
                    )}
                  </button>
                );
              })}
              {filteredChoices.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-500 italic">
                  No folders found matching your query
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

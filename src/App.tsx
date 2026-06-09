import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { File, Plus, RotateCw, ChevronDown, ChevronRight, Folder, FileText, Tag, Clock, Database, Link2, CheckCircle, FolderOpen, Trash2, X, Edit3, FolderPlus, FilePlus, Eye } from 'lucide-react';
import { fileService } from './file_Service';
import { vaultService } from './vault_Service';
import type { ExplorerNode, VaultInfo } from './types';

// Runtime Engine imports
import { SyncManager } from './runtime/sync/sync-manager';
import { KnowledgeQueryEngine } from './runtime/graph/knowledge-query-engine';
import { resolveLinkPath } from './runtime/graph/link-resolver';
import { extractBlocksFromMarkdown } from './runtime/parser/block-extractor';
import { serializeBlocksToMarkdown } from './runtime/parser/markdown-parser';
import type { InlineNode, RuntimeBlock } from './runtime/types/runtime-types';
import { BlockEditor } from './components/BlockEditor';

type ToastType = 'create-file' | 'create-folder' | 'modify' | 'delete' | 'vault';
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

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

  // Editor State
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
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
  }>({ visible: false, x: 0, y: 0, node: null });

  // Structured Knowledge Runtime UI states
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [editorBlocks, setEditorBlocks] = useState<RuntimeBlock[]>([]);
  const [scanTrigger, setScanTrigger] = useState<number>(0);

  // Drag & Drop State
  const [draggedNode, setDraggedNode] = useState<ExplorerNode | null>(null);
  const [draggedOverFolder, setDraggedOverFolder] = useState<string | null>(null);

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

    for (const filePath of mdFiles) {
      try {
        const content = await fileService.readFile(filePath);
        syncManager.handleFileChange(filePath, content, mdFiles);
      } catch (err) {
        console.error('Failed to parse file during initial scan:', filePath, err);
      }
    }
    setScanTrigger(prev => prev + 1);
  }, [getMdFilesFromTree]);

  // Load Vault and directory list on mount with full vault scan
  useEffect(() => {
    const initialize = async () => {
      await loadVaultInfo();
      const tree = await fileService.getVaultTree();
      setDirectoryTrees(tree);
      await initialVaultScan(tree);
    };
    initialize();
  }, [initialVaultScan]);

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
        if (payload.event === 'create' || payload.event === 'modify') {
          try {
            const content = await fileService.readFile(payload.path);
            syncManager.handleFileChange(payload.path, content, allPaths);
            setScanTrigger(prev => prev + 1); // reactive refresh properties/backlinks
          } catch (err) {
            console.error('Failed incremental sync for file:', payload.path, err);
          }
        } else if (payload.event === 'delete') {
          syncManager.handleFileDelete(payload.path, allPaths);
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
  }, [addToast, getMdFilesFromTree, initialVaultScan]);

  const loadVaultInfo = async () => {
    setIsLoadingVault(true);
    try {
      const info = await vaultService.getVaultInfo();
      setVaultInfo(info);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingVault(false);
    }
  };

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
    if (activeFilePath && isEditMode && editorBlocks.length > 0) {
      try {
        const currentContent = serializeBlocksToMarkdown(editorBlocks);
        ignoreWatcherToast(activeFilePath, 'modify');
        await fileService.writeFile(activeFilePath, currentContent);

        // Sync the change in syncManager
        const allPaths = getMdFilesFromTree(directoryTrees);
        SyncManager.getInstance().handleFileChange(activeFilePath, currentContent, allPaths);
        setScanTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Failed to save current file:', err);
      }
    }
  };

  // Helper to save block updates directly
  const saveBlocksDirectly = async (blocksToSave: RuntimeBlock[]) => {
    if (activeFilePath) {
      try {
        const currentContent = serializeBlocksToMarkdown(blocksToSave);
        ignoreWatcherToast(activeFilePath, 'modify');
        await fileService.writeFile(activeFilePath, currentContent);

        // Sync the change in syncManager
        const allPaths = getMdFilesFromTree(directoryTrees);
        SyncManager.getInstance().handleFileChange(activeFilePath, currentContent, allPaths);
        setScanTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Failed to save blocks directly:', err);
      }
    }
  };

  // Sync blocks when active note changes
  useEffect(() => {
    if (activeFilePath) {
      fileService.readFile(activeFilePath).then(content => {
        const blocks = extractBlocksFromMarkdown(content, activeFilePath);
        setEditorBlocks(blocks);
      });
    } else {
      setEditorBlocks([]);
    }
  }, [activeFilePath]);

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
    addToast('vault', `Filtering by tag: #${tag}`);
  };

  // Embed note preview viewer
  const EmbeddedNoteView = ({ path }: { path: string }) => {
    const allPaths = getMdFilesFromTree(directoryTrees);
    const resolvedPath = resolveLinkPath(path, activeFilePath || '', allPaths);
    const [content, setContent] = useState<string>('');

    useEffect(() => {
      if (resolvedPath) {
        fileService.readFile(resolvedPath).then(setContent);
      }
    }, [resolvedPath]);

    if (!resolvedPath) {
      return <div className="text-xs text-red-400 italic">Target [[{path}]] not found.</div>;
    }

    const blocks = extractBlocksFromMarkdown(content, resolvedPath);
    return (
      <div className="space-y-2 border-l-2 border-blue-500/30 pl-4 py-1 text-sm text-gray-400 select-text">
        {blocks.map((block) => (
          <div key={block.id}>{renderInline(block.children)}</div>
        ))}
      </div>
    );
  };

  // Render Inline children nodes
  const renderInline = (nodes: InlineNode[]) => {
    return nodes.map((node, idx) => {
      switch (node.type) {
        case 'text':
          return <span key={idx}>{node.content}</span>;
        case 'wikilink':
          return (
            <span
              key={idx}
              className="wikilink text-blue-400 hover:text-blue-300 underline underline-offset-4 cursor-pointer font-medium"
              onClick={() => handleWikilinkClick(node.content)}
            >
              {node.raw}
            </span>
          );
        case 'embed':
          return (
            <div key={idx} className="my-4 p-4 rounded-xl border border-white/10 bg-white/5 no-drag text-left">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-bold font-sans">
                <Link2 className="w-3 h-3" /> Embed: {node.content}
              </div>
              <EmbeddedNoteView path={node.content} />
            </div>
          );
        case 'hashtag':
          return (
            <span
              key={idx}
              className="hashtag text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-xs inline-block m-0.5"
              onClick={() => handleHashtagClick(node.content)}
            >
              {node.raw}
            </span>
          );
        case 'bold':
          return <strong key={idx} className="font-bold text-white">{node.content}</strong>;
        case 'italic':
          return <em key={idx} className="italic text-gray-300">{node.content}</em>;
        case 'code':
          return <code key={idx} className="bg-[#1e2230] text-blue-300 px-1.5 py-0.5 rounded font-mono text-sm">{node.content}</code>;
        default:
          return <span key={idx}>{node.raw}</span>;
      }
    });
  };

  // Helper to parse tables for Preview Mode
  const parseTableContentForPreview = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const parseRow = (row: string) => {
      let clean = row;
      if (clean.startsWith('|')) clean = clean.slice(1);
      if (clean.endsWith('|')) clean = clean.slice(0, -1);
      return clean.split('|').map(c => c.trim());
    };
    return [parseRow(lines[0]), ...lines.slice(2).map(parseRow)];
  };

  // Toggle checkbox state directly from Preview Mode
  const togglePreviewCheckbox = async (blockId: string) => {
    const updated = editorBlocks.map(b => {
      if (b.id === blockId) {
        return {
          ...b,
          metadata: {
            ...b.metadata,
            checked: !b.metadata?.checked
          }
        };
      }
      return b;
    });
    setEditorBlocks(updated);
    await saveBlocksDirectly(updated);
  };

  // Render Structured blocks
  const renderBlock = (block: any) => {
    const headingClasses = [
      '',
      'text-4xl font-bold text-white mt-8 mb-4 border-b border-white/5 pb-2',
      'text-2xl font-semibold text-white mt-6 mb-3',
      'text-xl font-semibold text-gray-100 mt-4 mb-2',
      'text-lg font-medium text-gray-200 mt-3 mb-1.5',
      'text-md font-medium text-gray-300 mt-2 mb-1',
      'text-sm font-medium text-gray-400 mt-2 mb-1'
    ];

    switch (block.type) {
      case 'heading':
        const hLevel = block.level || 1;
        const TagName = `h${hLevel}` as any;
        return (
          <TagName key={block.id} className={headingClasses[hLevel]}>
            {renderInline(block.children)}
          </TagName>
        );

      case 'paragraph':
        return (
          <p key={block.id} className="mb-4 text-gray-300 leading-relaxed text-left">
            {renderInline(block.children)}
          </p>
        );

      case 'list-item':
        const indentLevel = block.level || 0;
        const indentStyle = { paddingLeft: `${indentLevel * 1.5}rem` };
        const isTask = block.metadata?.checked !== undefined;

        if (isTask) {
          const checked = !!block.metadata.checked;
          return (
            <div key={block.id} style={indentStyle} className="flex items-start gap-2.5 my-1.5 text-gray-300 text-left">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePreviewCheckbox(block.id)}
                className="mt-1.5 accent-blue-500 rounded cursor-pointer w-4 h-4"
              />
              <span className={checked ? 'line-through text-gray-500' : ''}>
                {renderInline(block.children)}
              </span>
            </div>
          );
        }

        return (
          <div key={block.id} style={indentStyle} className="flex items-start gap-2.5 my-1.5 text-gray-300 text-left">
            <span className="text-blue-500 mt-1 select-none font-bold text-lg leading-none">•</span>
            <span className="flex-1">{renderInline(block.children)}</span>
          </div>
        );

      case 'quote':
        return (
          <blockquote key={block.id} className="border-l-4 border-blue-500/40 bg-white/5 p-4 rounded-r-xl my-4 text-gray-400 italic text-left whitespace-pre-wrap">
            {renderInline(block.children)}
          </blockquote>
        );

      case 'callout':
        const calloutType = block.info || 'NOTE';
        let calloutColor = 'border-blue-500 bg-blue-500/5 text-blue-200';
        let iconColor = 'text-blue-400';
        if (calloutType === 'WARNING') {
          calloutColor = 'border-yellow-500 bg-yellow-500/5 text-yellow-200';
          iconColor = 'text-yellow-400';
        } else if (calloutType === 'ERROR' || calloutType === 'DANGER') {
          calloutColor = 'border-red-500 bg-red-500/5 text-red-200';
          iconColor = 'text-red-400';
        } else if (calloutType === 'SUCCESS') {
          calloutColor = 'border-emerald-500 bg-emerald-500/5 text-emerald-200';
          iconColor = 'text-emerald-400';
        }

        return (
          <div key={block.id} className={`border-l-4 p-4 rounded-r-xl my-4 flex flex-col gap-1.5 text-left ${calloutColor}`}>
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
              <Tag className={`w-3.5 h-3.5 ${iconColor}`} />
              <span>{calloutType}</span>
            </div>
            <div className="text-sm">{renderInline(block.children)}</div>
          </div>
        );

      case 'code':
        return (
          <pre key={block.id} className="bg-[#181b24] p-4 rounded-xl border border-white/5 overflow-x-auto my-4 text-sm font-mono text-gray-300 text-left select-text">
            {block.info && (
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2 font-bold font-sans">
                {block.info}
              </div>
            )}
            <code>{block.content}</code>
          </pre>
        );

      case 'table': {
        const grid = parseTableContentForPreview(block.content);
        return (
          <div key={block.id} className="my-4 overflow-x-auto border border-white/10 rounded-xl bg-white/5 p-4 text-left">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {grid[0]?.map((header, colIdx) => (
                    <th key={colIdx} className="border border-white/10 p-2 bg-[#1c1f2a] text-white font-semibold text-left">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.slice(1).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="border border-white/10 p-2 text-gray-300">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'empty':
        return <div key={block.id} className="h-4" />;

      default:
        return <div key={block.id}>{renderInline(block.children)}</div>;
    }
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
      node
    });
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

  // Save content on editing exit (blur)
  const handleContentBlur = async () => {
    await saveCurrentFile();
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
  const mentions = useMemo(() => activeFilePath ? queryEngine.getLinkedMentions(activeFilePath, allPaths) : [], [activeFilePath, allPaths, scanTrigger]);
  const activeDocBlocks = activeDoc ? activeDoc.blocks : [];

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
            <div className="p-4 border-t border-white/5">
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
              {/* Title & Preview Toggle Header */}
              <div className="flex justify-between items-start gap-4">
                <input
                  type="text"
                  value={activeFileTitle}
                  onChange={(e) => setActiveFileTitle(e.target.value)}
                  className="w-full bg-transparent outline-none text-5xl font-bold text-white placeholder-gray-600"
                  placeholder="Untitled"
                  disabled={!activeFilePath}
                />

                {/* Edit / Preview Mode Switcher */}
                {activeFilePath && (
                  <div className="flex bg-white/5 p-1 rounded-xl gap-1 shrink-0">
                    <button
                      onClick={() => setIsEditMode(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border-0 outline-none cursor-pointer ${isEditMode
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-white'
                        }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={async () => {
                        await saveCurrentFile();
                        setIsEditMode(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border-0 outline-none cursor-pointer ${!isEditMode
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-white'
                        }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                  </div>
                )}
              </div>

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
              {isEditMode ? (
                activeFilePath ? (
                  <BlockEditor
                    blocks={editorBlocks}
                    onChange={(updatedBlocks) => {
                      setEditorBlocks(updatedBlocks);
                      saveBlocksDirectly(updatedBlocks);
                    }}
                  />
                ) : (
                  <div className="mt-6 min-h-[500px] text-[16px] leading-8 text-gray-500 italic text-left select-none">
                    No note selected. Select a note from the file explorer on the left or create a new file to start writing.
                  </div>
                )
              ) : (
                <div className="mt-6 min-h-[500px] text-[16px] leading-8 text-gray-300 select-text space-y-6">
                  {activeDocBlocks.length > 0 ? (
                    activeDocBlocks.map((block) => renderBlock(block))
                  ) : (
                    <p className="text-gray-500 italic text-left">This document is empty.</p>
                  )}
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
        </div>
      )}
    </div>
  );
}

export default App;

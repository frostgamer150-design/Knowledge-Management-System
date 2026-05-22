export interface VaultInfo {
  vaultPath: string;
  lastOpened: string;
  name: string;
}

export interface FolderNode {
  name: string;
  path: string;
  isFolder: true;
  children: (FolderNode | FileNode)[];
  isOpen?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  isFolder: false;
}

export type ExplorerNode = FolderNode | FileNode;
// Union type, có thể là folderNode hoặc FileNode
import type { RuntimeBlock } from '../types/runtime-types';

/**
 * Global In-Memory Registry caching all blocks across all workspace documents.
 */
export class BlockRegistry {
  private static instance: BlockRegistry | null = null;

  // Map of block ID to RuntimeBlock
  private blocks = new Map<string, RuntimeBlock>();
  // Map of file path (normalized, relative) to Set of block IDs
  private fileToBlocks = new Map<string, Set<string>>();

  private constructor() {}

  public static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  /**
   * Registers a list of blocks for a specific file.
   * Removes previous blocks associated with that file.
   */
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

  /**
   * Unregisters all blocks associated with a specific file.
   */
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

  /**
   * Fetches a block by its ID.
   */
  public getBlock(id: string): RuntimeBlock | undefined {
    return this.blocks.get(id);
  }

  /**
   * Fetches all blocks belonging to a specific file.
   */
  public getBlocksByFile(filePath: string): RuntimeBlock[] {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const ids = this.fileToBlocks.get(normalizedPath);
    if (!ids) return [];

    const result: RuntimeBlock[] = [];
    for (const id of ids) {
      const block = this.blocks.get(id);
      if (block) result.push(block);
    }
    // Sort by line start to preserve document order
    return result.sort((a, b) => a.metadata.lineStart - b.metadata.lineStart);
  }

  /**
   * General-purpose block query.
   */
  public queryBlocks(filter: (block: RuntimeBlock) => boolean): RuntimeBlock[] {
    const result: RuntimeBlock[] = [];
    for (const block of this.blocks.values()) {
      if (filter(block)) {
        result.push(block);
      }
    }
    return result;
  }

  /**
   * Clears the entire registry (useful during vault switching).
   */
  public clear(): void {
    this.blocks.clear();
    this.fileToBlocks.clear();
  }
}

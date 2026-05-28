import { extractBlocksFromMarkdown } from '../parser/block-extractor';
import { syncDocumentRuntime } from './runtime-sync';
import { BlockRegistry } from '../store/block-registry';
import { GraphRuntime } from '../graph/graph-runtime';
import { RelationshipIndex } from '../graph/relationship-index';
import type { RuntimeDocument } from '../types/runtime-types';

/**
 * Main orchestrator of the Synchronization Pipeline.
 * Parses changed documents, caches them, compares differences, and syncs registry/graph.
 */
export class SyncManager {
  private static instance: SyncManager | null = null;

  // Cache of normalized relative path to parsed RuntimeDocument
  private documents = new Map<string, RuntimeDocument>();

  private constructor() {}

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Called when a file is created or updated in the vault.
   * Performs block extraction, metadata calculation, diffing, and graph updates.
   */
  public handleFileChange(filePath: string, content: string, allPaths: string[]): RuntimeDocument {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const oldDoc = this.documents.get(normalizedPath) || null;

    // 1. Extract blocks using the parser pipeline
    const blocks = extractBlocksFromMarkdown(content, normalizedPath);

    // 2. Determine document title: first H1 heading, or filename fallback
    const firstH1 = blocks.find(b => b.type === 'heading' && b.level === 1);
    const fileName = normalizedPath.split('/').pop() ?? 'Untitled';
    const title = firstH1 ? firstH1.content.trim() : fileName.replace(/\.md$/i, '');

    // 3. Aggregate document-level tags, references, and stats
    const tagsSet = new Set<string>();
    const refsSet = new Set<string>();
    let wordCount = 0;
    const charCount = content.length;

    for (const block of blocks) {
      for (const tag of block.metadata.tags) {
        tagsSet.add(tag);
      }
      for (const ref of block.metadata.references) {
        refsSet.add(ref);
      }
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

    // 4. Update local cache
    this.documents.set(normalizedPath, newDoc);

    // 5. Synchronize registry, graph, and relationship indexes
    syncDocumentRuntime(normalizedPath, oldDoc, newDoc, allPaths);

    return newDoc;
  }

  /**
   * Called when a file is deleted from the vault. Clears indexes.
   */
  public handleFileDelete(filePath: string, allPaths: string[]): void {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const oldDoc = this.documents.get(normalizedPath) || null;

    if (oldDoc) {
      this.documents.delete(normalizedPath);
      syncDocumentRuntime(normalizedPath, oldDoc, null, allPaths);
    }
  }

  /**
   * Resets all indexes and caches when switching vaults.
   */
  public handleVaultSwitch(): void {
    this.documents.clear();
    BlockRegistry.getInstance().clear();
    GraphRuntime.getInstance().clear();
    RelationshipIndex.getInstance().clear();
  }

  /**
   * Fetches a cached document.
   */
  public getDocument(filePath: string): RuntimeDocument | undefined {
    return this.documents.get(filePath.replace(/\\/g, '/'));
  }

  /**
   * Fetches all cached documents.
   */
  public getAllDocuments(): RuntimeDocument[] {
    return Array.from(this.documents.values());
  }
}

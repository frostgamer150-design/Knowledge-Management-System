import { RelationshipIndex } from './relationship-index';
import { BlockRegistry } from '../store/block-registry';
import { resolveLinkPath } from './link-resolver';
import type { RuntimeBlock } from '../types/runtime-types';

export interface LinkedMention {
  sourceFile: string;
  block: RuntimeBlock;
}

/**
 * High-performance query engine for the UI to traverse the knowledge base.
 */
export class KnowledgeQueryEngine {
  private static instance: KnowledgeQueryEngine | null = null;
  private relationshipIndex = RelationshipIndex.getInstance();
  private blockRegistry = BlockRegistry.getInstance();

  private constructor() {}

  public static getInstance(): KnowledgeQueryEngine {
    if (!KnowledgeQueryEngine.instance) {
      KnowledgeQueryEngine.instance = new KnowledgeQueryEngine();
    }
    return KnowledgeQueryEngine.instance;
  }

  /**
   * Returns a list of file paths referencing the target file path.
   */
  public getBacklinks(filePath: string): string[] {
    return this.relationshipIndex.getBacklinks(filePath);
  }

  /**
   * Returns all blocks in the workspace that reference the target file path, grouped by source file.
   */
  public getLinkedMentions(targetFilePath: string, allPaths: string[]): LinkedMention[] {
    const backlinks = this.getBacklinks(targetFilePath);
    const mentions: LinkedMention[] = [];

    for (const sourceFile of backlinks) {
      const blocks = this.blockRegistry.getBlocksByFile(sourceFile);
      for (const block of blocks) {
        // Check if any reference in the block resolves to the target file
        const matchesTarget = block.metadata.references.some(ref => {
          const resolved = resolveLinkPath(ref, sourceFile, allPaths);
          return resolved === targetFilePath;
        });

        if (matchesTarget) {
          mentions.push({
            sourceFile,
            block
          });
        }
      }
    }

    return mentions;
  }

  /**
   * Returns all unique tags present in the workspace.
   */
  public getAllTags(): string[] {
    return this.relationshipIndex.getAllTags();
  }

  /**
   * Returns all files associated with a specific tag.
   */
  public getFilesWithTag(tag: string): string[] {
    return this.relationshipIndex.getFilesWithTag(tag);
  }
}

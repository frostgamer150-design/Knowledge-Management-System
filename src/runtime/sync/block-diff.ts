import type { RuntimeBlock } from '../types/runtime-types';

export interface BlockDiff {
  added: RuntimeBlock[];
  removed: string[]; // List of removed block IDs
  updated: RuntimeBlock[]; // Blocks that had content updates at the same relative position
  moved: RuntimeBlock[]; // Blocks whose IDs are same but lines/parents shifted
}

/**
 * Heuristically diffs old blocks vs new blocks to find changes.
 */
export function diffBlocks(oldBlocks: RuntimeBlock[], newBlocks: RuntimeBlock[]): BlockDiff {
  const added: RuntimeBlock[] = [];
  const removed: string[] = [];
  const updated: RuntimeBlock[] = [];
  const moved: RuntimeBlock[] = [];

  const oldMap = new Map<string, RuntimeBlock>();
  for (const b of oldBlocks) {
    oldMap.set(b.id, b);
  }

  const newMap = new Map<string, RuntimeBlock>();
  for (const b of newBlocks) {
    newMap.set(b.id, b);
  }

  // 1. Identify removed block IDs
  for (const b of oldBlocks) {
    if (!newMap.has(b.id)) {
      removed.push(b.id);
    }
  }

  // 2. Identify added, updated, and moved blocks
  for (let i = 0; i < newBlocks.length; i++) {
    const newBlock = newBlocks[i];
    const oldBlock = oldMap.get(newBlock.id);

    if (!oldBlock) {
      // ID doesn't exist in old blocks. Check if it's an update at the same position.
      const correspondingOldBlock = oldBlocks[i];
      const isContentReplacement = correspondingOldBlock && 
                                   correspondingOldBlock.type === newBlock.type && 
                                   !newMap.has(correspondingOldBlock.id);

      if (isContentReplacement) {
        updated.push(newBlock);
        // Remove from removed list since it was updated in-place
        const remIdx = removed.indexOf(correspondingOldBlock.id);
        if (remIdx !== -1) {
          removed.splice(remIdx, 1);
        }
      } else {
        added.push(newBlock);
      }
    } else {
      // Block ID matches. Check if line range or nesting hierarchy changed.
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

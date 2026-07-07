import type { RuntimeBlock } from '../types/runtime-types';

/**
 * Normalizes runtime blocks, establishing parent-child hierarchy (e.g. setting parentId for nested list items)
 * and addressing common malformed structures.
 */
export function normalizeRuntimeBlocks(blocks: RuntimeBlock[]): RuntimeBlock[] {
  const stack: { id: string; level: number }[] = [];

  // Reset relations to build clean links
  for (const block of blocks) {
    block.parentId = null;
    block.childrenIds = [];
    block.metadata.parentId = undefined;
    block.metadata.childrenIds = [];
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const level = block.type === 'list-item' ? (block.level ?? 0) : 0;

    // Pop from stack until we find a parent block with a lower indentation level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length > 0) {
      const parentId = stack[stack.length - 1].id;
      block.parentId = parentId;
      block.metadata.parentId = parentId;

      // Find parent and append to childrenIds
      const parentBlock = blocks.find(b => b.id === parentId);
      if (parentBlock) {
        if (!parentBlock.childrenIds) {
          parentBlock.childrenIds = [];
        }
        parentBlock.childrenIds.push(block.id);

        if (!parentBlock.metadata.childrenIds) {
          parentBlock.metadata.childrenIds = [];
        }
        parentBlock.metadata.childrenIds.push(block.id);
      }
    }

    stack.push({ id: block.id, level });
  }

  return blocks;
}

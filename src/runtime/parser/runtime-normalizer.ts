import type { RuntimeBlock } from '../types/runtime-types';

/**
 * Normalizes runtime blocks, establishing parent-child hierarchy (e.g. setting parentId for nested list items)
 * and addressing common malformed structures.
 */
export function normalizeRuntimeBlocks(blocks: RuntimeBlock[]): RuntimeBlock[] {
  const listStack: { id: string; level: number }[] = [];

  // Reset relations to build clean links
  for (const block of blocks) {
    block.metadata.parentId = undefined;
    block.metadata.childrenIds = [];
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Establish parent-child relationship for nested list items
    if (block.type === 'list-item') {
      const level = block.level ?? 0;

      // Pop from stack until we find a parent list item with a lower indentation level
      while (listStack.length > 0 && listStack[listStack.length - 1].level >= level) {
        listStack.pop();
      }

      if (listStack.length > 0) {
        const parentId = listStack[listStack.length - 1].id;
        block.metadata.parentId = parentId;
        
        // Find parent and append to childrenIds
        const parentBlock = blocks.find(b => b.id === parentId);
        if (parentBlock) {
          if (!parentBlock.metadata.childrenIds) {
            parentBlock.metadata.childrenIds = [];
          }
          parentBlock.metadata.childrenIds.push(block.id);
        }
      }

      listStack.push({ id: block.id, level });
    } else {
      // Non-list item breaks the list nesting scope
      listStack.length = 0;
    }
  }

  return blocks;
}

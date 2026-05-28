import type { RuntimeBlock } from '../types/runtime-types';

/**
 * Normalizes runtime blocks, establishing parent-child hierarchy (e.g. setting parentId for nested list items)
 * and addressing common malformed structures.
 */
export function normalizeRuntimeBlocks(blocks: RuntimeBlock[]): RuntimeBlock[] {
  const listStack: { id: string; level: number }[] = [];

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
        block.metadata.parentId = listStack[listStack.length - 1].id;
      }

      listStack.push({ id: block.id, level });
    } else {
      // Non-list item breaks the list nesting scope
      listStack.length = 0;
    }
  }

  return blocks;
}

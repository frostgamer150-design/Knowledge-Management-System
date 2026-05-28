import type { RawBlock } from '../parser/markdown-parser';

export interface ASTDiffResult {
  added: RawBlock[];
  removed: RawBlock[];
  equivalent: boolean;
}

/**
 * Compares two AST raw block lists to check if they are structurally equivalent.
 */
export function diffAST(oldAST: RawBlock[], newAST: RawBlock[]): ASTDiffResult {
  const added: RawBlock[] = [];
  const removed: RawBlock[] = [];

  // Simple diffing: if lengths match and every block type and content matches, it's equivalent
  let equivalent = oldAST.length === newAST.length;

  if (equivalent) {
    for (let i = 0; i < oldAST.length; i++) {
      if (oldAST[i].type !== newAST[i].type || oldAST[i].content !== newAST[i].content) {
        equivalent = false;
        break;
      }
    }
  }

  if (!equivalent) {
    // Basic extraction of added/removed blocks by comparing contents
    const oldContents = new Set(oldAST.map(b => b.content));
    const newContents = new Set(newAST.map(b => b.content));

    for (const b of newAST) {
      if (!oldContents.has(b.content)) {
        added.push(b);
      }
    }

    for (const b of oldAST) {
      if (!newContents.has(b.content)) {
        removed.push(b);
      }
    }
  }

  return {
    added,
    removed,
    equivalent
  };
}

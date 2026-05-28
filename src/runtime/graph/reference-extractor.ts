import type { RuntimeBlock } from '../types/runtime-types';

export interface ResolvedReference {
  targetFile: string; // E.g. "Projects/system-design"
  anchor?: string;    // E.g. "^block-id" or "Header Name"
  type: 'file' | 'header' | 'block';
}

/**
 * Parses a reference string (e.g. "Projects/system-design#^abc") into file path and anchor properties.
 */
export function parseReferenceTarget(target: string): ResolvedReference {
  const parts = target.split('#');
  const targetFile = parts[0].trim();

  if (parts.length > 1) {
    const anchor = parts[1].trim();
    if (anchor.startsWith('^')) {
      return { targetFile, anchor, type: 'block' };
    }
    return { targetFile, anchor, type: 'header' };
  }

  return { targetFile, type: 'file' };
}

/**
 * Helper to extract unique Wikilinks from a list of RuntimeBlocks.
 */
export function extractDocumentReferences(blocks: RuntimeBlock[]): string[] {
  const refs = new Set<string>();
  for (const block of blocks) {
    for (const ref of block.metadata.references) {
      refs.add(ref);
    }
  }
  return Array.from(refs);
}

/**
 * Helper to extract unique Hashtags from a list of RuntimeBlocks.
 */
export function extractDocumentTags(blocks: RuntimeBlock[]): string[] {
  const tags = new Set<string>();
  for (const block of blocks) {
    for (const tag of block.metadata.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

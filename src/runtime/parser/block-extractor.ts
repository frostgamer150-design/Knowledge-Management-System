import type { RuntimeBlock } from '../types/runtime-types';
import { parseMarkdownToRawBlocks } from './markdown-parser';
import { buildRuntimeBlocks } from './runtime-builder';
import { normalizeRuntimeBlocks } from './runtime-normalizer';

/**
 * Parses raw Markdown text and extracts a flat, normalized array of RuntimeBlocks.
 */
export function extractBlocksFromMarkdown(content: string, sourceFile: string): RuntimeBlock[] {
  const rawBlocks = parseMarkdownToRawBlocks(content);
  const runtimeBlocks = buildRuntimeBlocks(rawBlocks, sourceFile);
  return normalizeRuntimeBlocks(runtimeBlocks);
}

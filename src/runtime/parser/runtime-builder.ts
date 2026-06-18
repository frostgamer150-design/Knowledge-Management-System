import type { RuntimeBlock, InlineNode } from '../types/runtime-types';
import type { RawBlock } from './markdown-parser';
import { parseStandardMarkdown } from './markdown-parser';
import { generateBlockId } from '../utils/id-generator';

function findClosingItalic(str: string): number {
  let i = 1;
  while (i < str.length) {
    if (str[i] === '*' && str[i + 1] === '*') {
      i += 2;
    } else if (str[i] === '*') {
      return i;
    } else {
      i++;
    }
  }
  return -1;
}

/**
 * Tokenizes inline elements within a string, extracting wikilinks, hashtags, bold, italic, and code.
 * Supports nesting recursively.
 */
export function tokenizeInlineContent(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let index = 0;

  while (index < text.length) {
    const sub = text.substring(index);

    // 1. Embeds: ![[link]]
    const embedMatch = sub.match(/^!\[\[([^\]]+)\]\]/);
    if (embedMatch) {
      const raw = embedMatch[0];
      const target = embedMatch[1];
      nodes.push({
        type: 'embed',
        content: target,
        raw
      });
      index += raw.length;
      continue;
    }

    // 2. Wikilinks: [[link]]
    const wikilinkMatch = sub.match(/^\[\[([^\]]+)\]\]/);
    if (wikilinkMatch) {
      const raw = wikilinkMatch[0];
      const target = wikilinkMatch[1];
      nodes.push({
        type: 'wikilink',
        content: target,
        raw
      });
      index += raw.length;
      continue;
    }

    // 3. Bold: **text**
    if (sub.startsWith('**')) {
      const closeIdx = sub.indexOf('**', 2);
      if (closeIdx !== -1) {
        const raw = sub.substring(0, closeIdx + 2);
        const inner = sub.substring(2, closeIdx);
        nodes.push({
          type: 'bold',
          content: inner,
          raw,
          children: tokenizeInlineContent(inner)
        });
        index += raw.length;
        continue;
      }
    }

    // 4. Italic: *text*
    if (sub.startsWith('*')) {
      const closeIdx = findClosingItalic(sub);
      if (closeIdx !== -1) {
        const raw = sub.substring(0, closeIdx + 1);
        const inner = sub.substring(1, closeIdx);
        nodes.push({
          type: 'italic',
          content: inner,
          raw,
          children: tokenizeInlineContent(inner)
        });
        index += raw.length;
        continue;
      }
    }

    // 5. Inline code: `code`
    const codeMatch = sub.match(/^`([^`]+)`/);
    if (codeMatch) {
      const raw = codeMatch[0];
      const inner = codeMatch[1];
      nodes.push({
        type: 'code',
        content: inner,
        raw
      });
      index += raw.length;
      continue;
    }

    // 6. Hashtags: #tag (must be boundary matched)
    const hashtagMatch = sub.match(/^#([a-zA-Z0-9_-]+)/);
    if (hashtagMatch) {
      const raw = hashtagMatch[0];
      const tag = hashtagMatch[1];
      const isStart = index === 0;
      const isPrecededBySpace = !isStart && /\s/.test(text[index - 1]);
      const isHexColor = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tag) &&
        (sub.length === raw.length || !/[a-zA-Z0-9_-]/.test(sub[raw.length]));

      if ((isStart || isPrecededBySpace) && !isHexColor) {
        nodes.push({
          type: 'hashtag',
          content: tag.toLowerCase(),
          raw
        });
        index += raw.length;
        continue;
      }
    }

    // 7. Text: read until next potential inline marker
    const nextSpecialIndex = sub.substring(1).search(/!\[\[|\[\[|\*\*|\*|`|#/);
    if (nextSpecialIndex === -1) {
      const textContent = sub;
      const prevNode = nodes[nodes.length - 1];
      if (prevNode && prevNode.type === 'text') {
        prevNode.content += textContent;
        prevNode.raw += textContent;
      } else {
        nodes.push({
          type: 'text',
          content: textContent,
          raw: textContent
        });
      }
      break;
    } else {
      const textContent = sub.substring(0, nextSpecialIndex + 1);
      const prevNode = nodes[nodes.length - 1];
      if (prevNode && prevNode.type === 'text') {
        prevNode.content += textContent;
        prevNode.raw += textContent;
      } else {
        nodes.push({
          type: 'text',
          content: textContent,
          raw: textContent
        });
      }
      index += textContent.length;
    }
  }

  return nodes;
}

function extractMetadataFromInlineNodes(nodes: InlineNode[]): { tags: string[]; references: string[] } {
  const tags: string[] = [];
  const references: string[] = [];

  function traverse(nList: InlineNode[]) {
    for (const n of nList) {
      if (n.type === 'hashtag') {
        tags.push(n.content);
      } else if (n.type === 'wikilink' || n.type === 'embed') {
        references.push(n.content);
      }
      if (n.children) {
        traverse(n.children);
      }
    }
  }

  traverse(nodes);
  return { tags, references };
}

/**
 * Builds runtime blocks from parsed raw blocks.
 */
export function buildRuntimeBlocks(rawBlocks: RawBlock[], sourceFile: string): RuntimeBlock[] {
  const result: RuntimeBlock[] = [];

  for (let idx = 0; idx < rawBlocks.length; idx++) {
    const raw = rawBlocks[idx];

    // Parse the inner content using standard markdown parser
    const subBlocks = parseStandardMarkdown(raw.content);

    if (subBlocks.length === 0) {
      // Fallback for empty blocks
      const id = raw.id || generateBlockId(sourceFile, idx, raw.content);
      result.push({
        id,
        type: raw.type || 'paragraph',
        level: raw.level,
        content: raw.content,
        info: raw.info,
        children: [],
        parentId: null,
        childrenIds: [],
        metadata: {
          sourceFile,
          lineStart: raw.lineStart,
          lineEnd: raw.lineEnd,
          tags: [],
          references: [],
          checked: raw.checked
        }
      });
      continue;
    }

    for (let subIdx = 0; subIdx < subBlocks.length; subIdx++) {
      const sub = subBlocks[subIdx];
      if (sub.type === 'empty') {
        continue;
      }
      const inlineNodes = tokenizeInlineContent(sub.content);

      const { tags, references } = extractMetadataFromInlineNodes(inlineNodes);

      // Use the raw block's ID for the first sub-block.
      // Generate new IDs for subsequent sub-blocks.
      const id = (subIdx === 0 && raw.id)
        ? raw.id
        : generateBlockId(sourceFile, idx * 1000 + subIdx, sub.content);

      // Adjust lines relative to the raw block's starting line in the original file
      const absoluteLineStart = raw.lineStart + sub.lineStart - 1;
      const absoluteLineEnd = raw.lineStart + sub.lineEnd - 1;

      result.push({
        id,
        type: sub.type,
        level: sub.level ?? raw.level,
        content: sub.content,
        info: sub.info ?? raw.info,
        children: inlineNodes,
        parentId: null,
        childrenIds: [],
        metadata: {
          sourceFile,
          lineStart: absoluteLineStart,
          lineEnd: absoluteLineEnd,
          tags,
          references,
          checked: sub.checked ?? raw.checked
        }
      });
    }
  }

  return result;
}
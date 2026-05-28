import type { RuntimeBlock, InlineNode } from '../types/runtime-types';
import type { RawBlock } from './markdown-parser';
import { generateBlockId } from '../utils/id-generator';

/**
 * Tokenizes inline elements within a string, extracting wikilinks, hashtags, bold, italic, and code.
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
    const boldMatch = sub.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const raw = boldMatch[0];
      const inner = boldMatch[1];
      nodes.push({
        type: 'bold',
        content: inner,
        raw
      });
      index += raw.length;
      continue;
    }

    // 4. Italic: *text*
    const italicMatch = sub.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      const raw = italicMatch[0];
      const inner = italicMatch[1];
      nodes.push({
        type: 'italic',
        content: inner,
        raw
      });
      index += raw.length;
      continue;
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

/**
 * Builds runtime blocks from parsed raw blocks.
 */
export function buildRuntimeBlocks(rawBlocks: RawBlock[], sourceFile: string): RuntimeBlock[] {
  return rawBlocks.map((raw, idx) => {
    const inlineNodes = tokenizeInlineContent(raw.content);
    
    // Extract tags and wikilinks/embeds for metadata
    const tags = inlineNodes.filter(n => n.type === 'hashtag').map(n => n.content);
    const references = inlineNodes.filter(n => n.type === 'wikilink' || n.type === 'embed').map(n => n.content);
    
    const id = generateBlockId(sourceFile, idx, raw.content);

    return {
      id,
      type: raw.type,
      level: raw.level,
      content: raw.content,
      children: inlineNodes,
      metadata: {
        sourceFile,
        lineStart: raw.lineStart,
        lineEnd: raw.lineEnd,
        tags,
        references
      }
    };
  });
}

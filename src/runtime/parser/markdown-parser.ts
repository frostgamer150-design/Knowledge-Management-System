export interface RawBlock {
  type: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'table' | 'callout' | 'empty';
  content: string;
  lineStart: number;
  lineEnd: number;
  level?: number;
  info?: string; // language for code block, callout type (e.g., 'NOTE', 'WARNING') for callout
  checked?: boolean; // checklist status
  id?: string;
}

/**
 * Parses raw Markdown text into a list of block elements with line number metadata
 * based on comment boundaries. If no comments are found, it falls back t`o a single block.
 */
export function parseMarkdownToRawBlocks(content: string): RawBlock[] {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.includes('<!-- block')) {
    return [{
      type: 'paragraph',
      content: content,
      lineStart: 1,
      lineEnd: content.split('\n').length
    }];
  }

  const lines = normalized.split('\n');
  const blocks: RawBlock[] = [];
  let currentMeta: any = null;
  let currentBlockContent: string[] = [];
  let currentBlockStartLine = 1;

  let inComment = false;
  let accumulatedComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inComment) {
      if (line.trim().startsWith('<!-- block')) {
        // Push existing block content if any
        if (currentMeta) {
          blocks.push({
            id: currentMeta.id,
            type: currentMeta.type || 'paragraph',
            content: currentBlockContent.join('\n'),
            lineStart: currentBlockStartLine,
            lineEnd: i,
            level: currentMeta.level,
            info: currentMeta.info,
            checked: currentMeta.checked
          });
          currentBlockContent = [];
        }

        inComment = true;
        accumulatedComment = line;
      }
    } else {
      accumulatedComment += '\n' + line;
    }

    if (inComment) {
      if (line.trim().endsWith('-->')) {
        // Parse metadata from accumulated comment
        const idMatch = accumulatedComment.match(/id="([^"]+)"/);
        const levelMatch = accumulatedComment.match(/level="([^"]+)"/);
        const typeMatch = accumulatedComment.match(/type="([^"]+)"/);
        const infoMatch = accumulatedComment.match(/info="([^"]+)"/);
        const checkedMatch = accumulatedComment.match(/checked="([^"]+)"/);

        currentMeta = {
          id: idMatch ? idMatch[1] : undefined,
          level: levelMatch ? parseInt(levelMatch[1], 10) : 0,
          type: typeMatch ? typeMatch[1] : 'paragraph',
          info: infoMatch ? infoMatch[1] : undefined,
          checked: checkedMatch ? checkedMatch[1] === 'true' : undefined
        };

        currentBlockStartLine = i + 2; // block content starts on the next line
        inComment = false;
        accumulatedComment = '';
      }
      continue;
    }

    if (currentMeta) {
      currentBlockContent.push(line);
    } else {
      // Content before any block comment
      currentMeta = { type: 'paragraph', level: 0 };
      currentBlockStartLine = 1;
      currentBlockContent.push(line);
    }
  }

  if (currentMeta) {
    blocks.push({
      id: currentMeta.id,
      type: currentMeta.type || 'paragraph',
      content: currentBlockContent.join('\n'),
      lineStart: currentBlockStartLine,
      lineEnd: lines.length,
      level: currentMeta.level,
      info: currentMeta.info,
      checked: currentMeta.checked
    });
  }

  return blocks;
}

/**
 * Standard markdown line-by-line parser for rendering rich previews inside individual blocks.
 */
export function parseStandardMarkdown(content: string): RawBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: RawBlock[] = [];

  let inCodeBlock = false;
  let codeBlockStartLine = 0;
  let codeBlockLanguage = '';
  let codeBlockLines: string[] = [];

  const headingRegex = /^(\s*)(#{1,6})\s+(.*)$/;
  const listItemRegex = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
  const blockquoteRegex = /^(\s*)>\s*(.*)$/;
  const calloutHeaderRegex = /^\[!([a-zA-Z]+)\]\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    // 1. Handle Code Blocks
    if (inCodeBlock) {
      if (trimmedLine.startsWith('```')) {
        // End of code block
        blocks.push({
          type: 'code',
          content: codeBlockLines.join('\n'),
          lineStart: codeBlockStartLine,
          lineEnd: lineNum,
          info: codeBlockLanguage
        });
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        codeBlockLines.push(rawLine);
      }
      continue;
    }

    if (trimmedLine.startsWith('```')) {
      inCodeBlock = true;
      codeBlockStartLine = lineNum;
      codeBlockLanguage = trimmedLine.slice(3).trim();
      continue;
    }

    // 2. Handle Tables
    const isTableStart = (idx: number) => {
      if (idx >= lines.length - 1) return false;
      const cur = lines[idx].trim();
      const next = lines[idx + 1].trim();

      const isDelim = next.startsWith('|') && next.endsWith('|') && /^[|:\s-]+$/.test(next);
      const isHeader = cur.startsWith('|') && cur.endsWith('|') && cur.includes('|');

      return isHeader && isDelim;
    };

    if (isTableStart(i)) {
      const tableLines: string[] = [];
      const startLine = lineNum;
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // i was advanced past the table, decrement so the loop increments correctly
      i--;

      blocks.push({
        type: 'table',
        content: tableLines.join('\n'),
        lineStart: startLine,
        lineEnd: i + 1
      });
      continue;
    }

    // 3. Handle Empty Lines
    if (trimmedLine === '') {
      blocks.push({
        type: 'empty',
        content: '',
        lineStart: lineNum,
        lineEnd: lineNum
      });
      continue;
    }

    // 4. Handle Headings
    const headingMatch = rawLine.match(headingRegex);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[2].length,
        content: headingMatch[3],
        lineStart: lineNum,
        lineEnd: lineNum
      });
      continue;
    }

    // 5. Handle Blockquotes and Callouts
    const blockquoteMatch = rawLine.match(blockquoteRegex);
    if (blockquoteMatch) {
      const innerContent = blockquoteMatch[2];
      const calloutHeaderMatch = innerContent.match(calloutHeaderRegex);

      if (calloutHeaderMatch) {
        blocks.push({
          type: 'callout',
          content: calloutHeaderMatch[2],
          info: calloutHeaderMatch[1].toUpperCase(),
          lineStart: lineNum,
          lineEnd: lineNum
        });
      } else {
        const prevBlock = blocks[blocks.length - 1];
        if (prevBlock && prevBlock.type === 'quote') {
          prevBlock.content += '\n' + innerContent;
          prevBlock.lineEnd = lineNum;
        } else {
          blocks.push({
            type: 'quote',
            content: innerContent,
            lineStart: lineNum,
            lineEnd: lineNum
          });
        }
      }
      continue;
    }

    // 6. Handle List Items
    const listMatch = rawLine.match(listItemRegex);
    if (listMatch) {
      const indent = listMatch[1].length;
      let text = listMatch[3];
      let checked: boolean | undefined = undefined;

      if (text.startsWith('[ ] ')) {
        checked = false;
        text = text.slice(4);
      } else if (text.startsWith('[x] ') || text.startsWith('[X] ')) {
        checked = true;
        text = text.slice(4);
      }

      blocks.push({
        type: 'list-item',
        level: Math.floor(indent / 2),
        content: text,
        lineStart: lineNum,
        lineEnd: lineNum,
        checked
      });
      continue;
    }

    // 7. Handle Multi-line list items (Indented detail line for previous list-item)
    const prevBlock = blocks[blocks.length - 1];
    if (prevBlock && prevBlock.type === 'list-item') {
      const indentSpaces = rawLine.match(/^\s*/)?.[0].length ?? 0;
      if (indentSpaces >= 2 &&
        !rawLine.match(listItemRegex) &&
        !rawLine.match(headingRegex) &&
        !rawLine.match(blockquoteRegex) &&
        !trimmedLine.startsWith('```')) {
        prevBlock.content += '\n' + trimmedLine;
        prevBlock.lineEnd = lineNum;
        continue;
      }
    }

    // 8. Handle Paragraphs (Merge consecutive non-special lines)
    if (prevBlock && prevBlock.type === 'paragraph') {
      prevBlock.content += '\n' + rawLine;
      prevBlock.lineEnd = lineNum;
    } else {
      blocks.push({
        type: 'paragraph',
        content: rawLine,
        lineStart: lineNum,
        lineEnd: lineNum
      });
    }
  }

  // If file ends but code block was left open
  if (inCodeBlock) {
    blocks.push({
      type: 'code',
      content: codeBlockLines.join('\n'),
      lineStart: codeBlockStartLine,
      lineEnd: lines.length,
      info: codeBlockLanguage
    });
  }

  return blocks;
}

/**
 * Serializes a list of blocks back to a single Markdown string using comments as metadata delimiters.
 */
export function serializeBlocksToMarkdown(blocks: any[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    const id = block.id;
    const level = block.level ?? 0;
    const type = block.type ?? 'paragraph';
    const info = block.info ?? '';
    const checked = block.metadata?.checked !== undefined ? block.metadata.checked : block.checked;

    const metaParts = [`id="${id}"`, `level="${level}"`, `type="${type}"`];
    if (info) metaParts.push(`info="${info}"`);
    if (checked !== undefined) metaParts.push(`checked="${checked}"`);

    parts.push(`<!-- block ${metaParts.join(' ')} -->`);
    parts.push(block.content ?? '');
  }

  return parts.join('\n');
}

/**
 * Parses YAML frontmatter from the top of the markdown note.
 */
export function parseFrontmatter(content: string): { properties: Record<string, any>; remainingContent: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n/);

  if (!match) {
    return { properties: {}, remainingContent: content };
  }

  const frontmatterText = match[1];
  const remainingContent = normalized.slice(match[0].length);
  const properties: Record<string, any> = {};

  const lines = frontmatterText.split('\n');
  let currentKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if it's a list item (e.g. "- tag1")
    if (trimmed.startsWith('-') && currentKey) {
      const val = trimmed.slice(1).trim();
      if (!Array.isArray(properties[currentKey])) {
        properties[currentKey] = [];
      }
      properties[currentKey].push(val);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      currentKey = key;

      if (val.startsWith('[') && val.endsWith(']')) {
        properties[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else if (val) {
        properties[key] = val;
      } else {
        properties[key] = []; // starts an array or empty string
      }
    }
  }

  return { properties, remainingContent };
}

/**
 * Serializes properties into YAML frontmatter.
 */
export function serializeFrontmatter(properties: Record<string, any>): string {
  if (!properties || Object.keys(properties).length === 0) {
    return '';
  }

  const lines = ['---'];
  for (const [key, value] of Object.entries(properties)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const val of value) {
        lines.push(`  - ${val}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push(''); // add empty line after frontmatter
  return lines.join('\n');
}


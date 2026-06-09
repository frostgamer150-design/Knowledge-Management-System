export interface RawBlock {
  type: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'table' | 'callout' | 'empty';
  content: string;
  lineStart: number;
  lineEnd: number;
  level?: number;
  info?: string; // language for code block, callout type (e.g., 'NOTE', 'WARNING') for callout
  checked?: boolean; // checklist status
}

/**
 * Parses raw Markdown text into a list of block elements with line number metadata.
 */
export function parseMarkdownToRawBlocks(content: string): RawBlock[] {
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
 * Serializes a list of blocks back to a single Markdown string.
 */
export function serializeBlocksToMarkdown(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const content = block.content || '';
    const level = block.level ?? 0;
    const checked = block.metadata?.checked ?? block.checked;

    switch (block.type) {
      case 'heading': {
        const hashtags = '#'.repeat(block.level || 1);
        lines.push(`${hashtags} ${content}`);
        break;
      }
      case 'paragraph': {
        lines.push(content);
        break;
      }
      case 'list-item': {
        const indent = '  '.repeat(level);
        const prefix = indent + '- ' + (checked !== undefined ? (checked ? '[x] ' : '[ ] ') : '');
        const itemLines = content.split('\n');
        lines.push(prefix + itemLines[0]);
        for (let j = 1; j < itemLines.length; j++) {
          lines.push(indent + '  ' + itemLines[j]);
        }
        break;
      }
      case 'quote': {
        const quoteLines = content.split('\n');
        for (const line of quoteLines) {
          lines.push(`> ${line}`);
        }
        break;
      }
      case 'callout': {
        const calloutType = block.info || 'NOTE';
        lines.push(`> [!${calloutType}]`);
        const calloutLines = content.split('\n');
        for (const line of calloutLines) {
          lines.push(`> ${line}`);
        }
        break;
      }
      case 'code': {
        const lang = block.info || '';
        lines.push('```' + lang);
        lines.push(content);
        lines.push('```');
        break;
      }
      case 'table': {
        lines.push(content);
        break;
      }
      case 'empty': {
        lines.push('');
        break;
      }
      default: {
        lines.push(content);
        break;
      }
    }
  }

  return lines.join('\n');
}

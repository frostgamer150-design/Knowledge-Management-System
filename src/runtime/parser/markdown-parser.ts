export interface RawBlock {
  type: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'table' | 'callout' | 'empty';
  content: string;
  lineStart: number;
  lineEnd: number;
  level?: number;
  info?: string; // language for code block, callout type (e.g., 'NOTE', 'WARNING') for callout
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

  const headingRegex = /^(#{1,6})\s+(.*)$/;
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

    // 2. Handle Empty Lines
    if (trimmedLine === '') {
      blocks.push({
        type: 'empty',
        content: '',
        lineStart: lineNum,
        lineEnd: lineNum
      });
      continue;
    }

    // 3. Handle Headings
    const headingMatch = rawLine.match(headingRegex);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2],
        lineStart: lineNum,
        lineEnd: lineNum
      });
      continue;
    }

    // 4. Handle Blockquotes and Callouts
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
        blocks.push({
          type: 'quote',
          content: innerContent,
          lineStart: lineNum,
          lineEnd: lineNum
        });
      }
      continue;
    }

    // 5. Handle List Items
    const listMatch = rawLine.match(listItemRegex);
    if (listMatch) {
      // Calculate level based on spaces (indentation)
      const indent = listMatch[1].length;
      blocks.push({
        type: 'list-item',
        level: Math.floor(indent / 2),
        content: listMatch[3],
        lineStart: lineNum,
        lineEnd: lineNum
      });
      continue;
    }

    // 6. Handle Paragraphs (Merge consecutive non-special lines)
    const prevBlock = blocks[blocks.length - 1];
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

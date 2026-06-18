import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  GripVertical,
  Plus,
  Trash2,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  CheckSquare,
  Code,
  Table as TableIcon,
  Quote,
  Link2
} from 'lucide-react';
import { normalizeRuntimeBlocks } from '../runtime/parser/runtime-normalizer';
import type { RuntimeBlock } from '../runtime/types/runtime-types';
import { parseStandardMarkdown } from '../runtime/parser/markdown-parser';
import { tokenizeInlineContent } from '../runtime/parser/runtime-builder';
import { fileService } from '../file_Service';
import { SyncManager } from '../runtime/sync/sync-manager';

interface BlockEditorProps {
  blocks: RuntimeBlock[];
  onChange: (updatedBlocks: RuntimeBlock[]) => void;
  onWikilinkClick?: (target: string) => void;
  onHashtagClick?: (tag: string) => void;
  resolveLinkPath?: (target: string) => string | null;
  allPaths?: string[];
}

// Helper to serialize sub-blocks back to markdown text
function serializeStandardSubBlocks(subBlocks: any[]): string {
  const lines: string[] = [];
  for (const block of subBlocks) {
    const content = block.content || '';
    const level = block.level ?? 0;
    const checked = block.checked;

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
        lines.push(prefix + content);
        break;
      }
      case 'quote': {
        lines.push(content.split('\n').map((line: string) => `> ${line}`).join('\n'));
        break;
      }
      case 'callout': {
        const calloutType = block.info || 'NOTE';
        lines.push(`> [!${calloutType}]\n` + content.split('\n').map((line: string) => `> ${line}`).join('\n'));
        break;
      }
      case 'code': {
        const lang = block.info || '';
        lines.push('```' + lang + '\n' + content + '\n```');
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

const EmbeddedNoteView: React.FC<{
  path: string;
  onWikilinkClick?: (target: string) => void;
  resolveLinkPath?: (target: string) => string | null;
}> = ({ path, onWikilinkClick, resolveLinkPath }) => {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    const resolved = resolveLinkPath ? resolveLinkPath(path) : null;
    if (resolved) {
      fileService.readFile(resolved).then(setContent).catch(console.error);
    }
  }, [path, resolveLinkPath]);

  if (!content) {
    return <div className="text-xs text-red-400 italic">Target [[{path}]] not found.</div>;
  }

  return (
    <div className="space-y-2 border-l-2 border-blue-500/30 pl-4 py-1 text-sm text-gray-400">
      <RenderParsedBlock
        content={content}
        onWikilinkClick={onWikilinkClick}
        resolveLinkPath={resolveLinkPath}
      />
    </div>
  );
};

const RenderParsedBlock: React.FC<{
  content: string;
  onWikilinkClick?: (target: string) => void;
  onHashtagClick?: (tag: string) => void;
  resolveLinkPath?: (target: string) => string | null;
  onContentChange?: (newContent: string) => void;
}> = ({ content, onWikilinkClick, onHashtagClick, resolveLinkPath, onContentChange }) => {
  const subBlocks = useMemo(() => {
    return parseStandardMarkdown(content);
  }, [content]);

  const handleCheckboxToggle = (subBlockIdx: number) => {
    const subBlocksCopy = [...subBlocks];
    if (subBlocksCopy[subBlockIdx]) {
      subBlocksCopy[subBlockIdx] = {
        ...subBlocksCopy[subBlockIdx],
        checked: !subBlocksCopy[subBlockIdx].checked
      };
    }
    const newContent = serializeStandardSubBlocks(subBlocksCopy);
    if (onContentChange) {
      onContentChange(newContent);
    }
  };

  const renderInline = (nodes: any[]) => {
    return nodes.map((node, idx) => {
      switch (node.type) {
        case 'text':
          return <span key={idx}>{node.content}</span>;
        case 'wikilink': {
          const resolved = resolveLinkPath ? resolveLinkPath(node.content) : null;
          const exists = !!resolved;
          const title = resolved 
            ? (SyncManager.getInstance().getDocument(resolved)?.title || node.content) 
            : node.content;

          return (
            <span
              key={idx}
              className={`wikilink cursor-pointer font-medium transition ${
                exists 
                  ? 'text-blue-400 hover:text-blue-300 underline underline-offset-4' 
                  : 'text-red-400/80 hover:text-red-300 border-b border-dashed border-red-400/60'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (onWikilinkClick) onWikilinkClick(node.content);
              }}
            >
              {exists ? `[[${title}]]` : node.raw}
            </span>
          );
        }
        case 'embed':
          return (
            <div key={idx} className="my-4 p-4 rounded-xl border border-white/10 bg-white/5 text-left" onClick={(e) => e.stopPropagation()}>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-bold font-sans">
                <Link2 className="w-3 h-3" /> Embed: {node.content}
              </div>
              <EmbeddedNoteView path={node.content} onWikilinkClick={onWikilinkClick} resolveLinkPath={resolveLinkPath} />
            </div>
          );
        case 'hashtag':
          return (
            <span
              key={idx}
              className="hashtag text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-xs inline-block m-0.5"
              onClick={(e) => {
                e.stopPropagation();
                if (onHashtagClick) onHashtagClick(node.content);
              }}
            >
              {node.raw}
            </span>
          );
        case 'bold':
          return <strong key={idx} className="font-bold text-white">{node.children ? renderInline(node.children) : node.content}</strong>;
        case 'italic':
          return <em key={idx} className="italic text-gray-300">{node.children ? renderInline(node.children) : node.content}</em>;
        case 'code':
          return <code key={idx} className="bg-[#1e2230] text-blue-300 px-1.5 py-0.5 rounded font-mono text-sm">{node.content}</code>;
        default:
          return <span key={idx}>{node.raw}</span>;
      }
    });
  };

  const renderSubBlock = (sub: any, sIdx: number) => {
    const inlineNodes = tokenizeInlineContent(sub.content);
    const headingClasses = [
      '',
      'text-3xl font-bold text-white mt-6 mb-2 border-b border-white/5 pb-1',
      'text-2xl font-semibold text-white mt-4 mb-2',
      'text-xl font-semibold text-gray-200 mt-2 mb-1',
      'text-lg font-medium text-gray-200 mt-2 mb-1',
      'text-md font-medium text-gray-300 mt-1 mb-1',
      'text-sm font-medium text-gray-400 mt-1 mb-1'
    ];

    switch (sub.type) {
      case 'heading': {
        const level = sub.level || 1;
        const Tag = `h${level}` as any;
        return <Tag key={sIdx} className={headingClasses[level]}>{renderInline(inlineNodes)}</Tag>;
      }
      case 'paragraph': {
        return <p key={sIdx} className="mb-3 text-gray-300 leading-relaxed whitespace-pre-wrap">{renderInline(inlineNodes)}</p>;
      }
      case 'list-item': {
        const checked = sub.checked;
        const indentStyle = { paddingLeft: `${(sub.level || 0) * 1.5}rem` };
        if (checked !== undefined) {
          return (
            <div key={sIdx} style={indentStyle} className="flex items-start gap-2.5 my-1.5 text-gray-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  e.stopPropagation();
                  handleCheckboxToggle(sIdx);
                }}
                className="mt-1.5 accent-blue-500 rounded cursor-pointer w-4 h-4"
              />
              <span className={checked ? 'line-through text-gray-500' : ''}>
                {renderInline(inlineNodes)}
              </span>
            </div>
          );
        }
        return (
          <div key={sIdx} style={indentStyle} className="flex items-start gap-2.5 my-1.5 text-gray-300">
            <span className="text-blue-500 mt-1 select-none font-bold text-lg leading-none">•</span>
            <span className="flex-1">{renderInline(inlineNodes)}</span>
          </div>
        );
      }
      case 'quote': {
        return (
          <blockquote key={sIdx} className="border-l-4 border-blue-500/40 bg-white/5 p-4 rounded-r-xl my-4 text-gray-400 italic whitespace-pre-wrap font-sans">
            {renderInline(inlineNodes)}
          </blockquote>
        );
      }
      case 'callout': {
        const calloutType = sub.info || 'NOTE';
        let calloutColor = 'border-blue-500 bg-blue-500/5 text-blue-200';
        if (calloutType === 'WARNING') calloutColor = 'border-yellow-500 bg-yellow-500/5 text-yellow-200';
        else if (calloutType === 'ERROR' || calloutType === 'DANGER') calloutColor = 'border-red-500 bg-red-500/5 text-red-200';
        else if (calloutType === 'SUCCESS') calloutColor = 'border-emerald-500 bg-emerald-500/5 text-emerald-200';

        return (
          <div key={sIdx} className={`border-l-4 p-4 rounded-r-xl my-4 flex flex-col gap-1.5 text-left ${calloutColor}`}>
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
              <span>{calloutType}</span>
            </div>
            <div className="text-sm">{renderInline(inlineNodes)}</div>
          </div>
        );
      }
      case 'code': {
        return (
          <pre key={sIdx} className="bg-[#181b24] p-4 rounded-xl border border-white/5 overflow-x-auto my-4 text-sm font-mono text-gray-300 select-text">
            {sub.info && (
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2 font-bold font-sans">
                {sub.info}
              </div>
            )}
            <code>{sub.content}</code>
          </pre>
        );
      }
      case 'table': {
        const lines = sub.content.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length < 2) return null;
        const parseRow = (row: string) => {
          let clean = row;
          if (clean.startsWith('|')) clean = clean.slice(1);
          if (clean.endsWith('|')) clean = clean.slice(0, -1);
          return clean.split('|').map(c => c.trim());
        };
        const headers = parseRow(lines[0]);
        const rows = lines.slice(2).map(parseRow);
        return (
          <div key={sIdx} className="my-4 overflow-x-auto border border-white/10 rounded-xl bg-white/5 p-4">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {headers.map((header, colIdx) => (
                    <th key={colIdx} className="border border-white/10 p-2 bg-[#1c1f2a] text-white font-semibold text-left">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="border border-white/10 p-2 text-gray-300">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'empty':
        return <div key={sIdx} className="h-4" />;
      default:
        return <div key={sIdx}>{renderInline(inlineNodes)}</div>;
    }
  };

  return (
    <div className="text-left w-full select-text">
      {subBlocks.length > 0 ? (
        subBlocks.map((sub, sIdx) => renderSubBlock(sub, sIdx))
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
};

// Helper function to infer block type based on its raw content
function inferBlockTypeAndMetadata(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const firstLine = lines[0];
    const info = firstLine.slice(3).trim();
    return { type: 'code', info };
  }

  if (trimmed.startsWith('|') && trimmed.includes('\n')) {
    return { type: 'table' };
  }

  const headingMatch = content.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    return { type: 'heading' };
  }

  const checklistMatch = content.match(/^([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (checklistMatch) {
    return { type: 'list-item', checked: checklistMatch[2].toLowerCase() === 'x' };
  }

  const listItemMatch = content.match(/^([-*+])\s+(.*)$/);
  if (listItemMatch) {
    return { type: 'list-item', checked: undefined };
  }

  const quoteMatch = content.match(/^>\s+(.*)$/);
  if (quoteMatch) {
    const calloutMatch = quoteMatch[1].match(/^\[!([a-zA-Z]+)\]\s*(.*)$/);
    if (calloutMatch) {
      return { type: 'callout', info: calloutMatch[1].toUpperCase() };
    }
    return { type: 'quote' };
  }

  return { type: 'paragraph' };
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  blocks,
  onChange,
  onWikilinkClick,
  onHashtagClick,
  resolveLinkPath,
  allPaths
}) => {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cursorPositionRef = useRef<'start' | 'end' | number | null>('end');

  // Autocomplete states
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteCoords, setAutocompleteCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const filteredSuggestions = useMemo(() => {
    if (!allPaths) return [];
    const cleanPaths = allPaths.map(p => p.replace(/\.md$/, ''));
    if (!autocompleteQuery) {
      return cleanPaths.slice(0, 8);
    }
    const q = autocompleteQuery.toLowerCase();
    const matches = cleanPaths.filter(p => p.toLowerCase().includes(q));

    matches.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aStarts = aLower.startsWith(q);
      const bStarts = bLower.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });

    return matches.slice(0, 8);
  }, [allPaths, autocompleteQuery]);

  const checkAutocompleteTrigger = (block: RuntimeBlock, blockIdx: number) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setShowAutocomplete(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType !== Node.TEXT_NODE) {
      setShowAutocomplete(false);
      return;
    }

    const text = textNode.textContent || '';
    const offset = range.startOffset;

    const textBeforeCaret = text.slice(0, offset);
    const lastOpenIdx = textBeforeCaret.lastIndexOf('[[');

    if (lastOpenIdx !== -1) {
      const closeIdx = textBeforeCaret.indexOf(']]', lastOpenIdx);
      if (closeIdx === -1) {
        const query = textBeforeCaret.slice(lastOpenIdx + 2);
        setAutocompleteQuery(query);
        setAutocompleteIndex(0);
        setShowAutocomplete(true);

        const rects = range.getClientRects();
        let rect = rects[0] || range.getBoundingClientRect();

        let x = rect.left;
        let y = rect.bottom;

        if (x === 0 && y === 0) {
          const parentEl = textNode.parentElement;
          if (parentEl) {
            const parentRect = parentEl.getBoundingClientRect();
            x = parentRect.left;
            y = parentRect.bottom;
          }
        }

        // Keep inside screen horizontally
        if (x + 270 > window.innerWidth) {
          x = Math.max(10, window.innerWidth - 270);
        }

        // Keep inside screen vertically (flip to display above caret if needed)
        if (y + 250 > window.innerHeight) {
          y = Math.max(10, rect.top - 246);
        } else {
          y = y + 6;
        }

        setAutocompleteCoords({ x, y });
        return;
      }
    }

    setShowAutocomplete(false);
  };

  const insertWikilink = (selectedNote: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;

    const text = textNode.textContent || '';
    const offset = range.startOffset;

    const textBeforeCaret = text.slice(0, offset);
    const lastOpenIdx = textBeforeCaret.lastIndexOf('[[');

    if (lastOpenIdx !== -1) {
      const beforeLink = text.slice(0, lastOpenIdx);
      const afterCaret = text.slice(offset);
      const newLinkText = `[[${selectedNote}]]`;
      const newText = beforeLink + newLinkText + afterCaret;

      textNode.textContent = newText;

      const newCaretOffset = beforeLink.length + newLinkText.length;

      const newRange = document.createRange();
      newRange.setStart(textNode, newCaretOffset);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      setShowAutocomplete(false);

      if (focusedBlockId) {
        const blockIdx = blocks.findIndex(b => b.id === focusedBlockId);
        if (blockIdx !== -1) {
          handleContentChange(blockIdx, newText);
          cursorPositionRef.current = newCaretOffset;
          setFocusedBlockId(null);
          setTimeout(() => {
            setFocusedBlockId(blocks[blockIdx].id);
          }, 10);
        }
      }
    }
  };


  // Maintain focus and position cursor correctly when focusedBlockId changes
  useEffect(() => {
    if (focusedBlockId && blockRefs.current[focusedBlockId]) {
      const el = blockRefs.current[focusedBlockId];
      if (el && document.activeElement !== el) {
        el.focus();
        const range = document.createRange();
        const sel = window.getSelection();

        if (el.firstChild) {
          const pos = cursorPositionRef.current;
          if (pos === 'start') {
            range.setStart(el.firstChild, 0);
            range.collapse(true);
          } else if (pos === 'end') {
            range.setStart(el.firstChild, el.firstChild.textContent?.length || 0);
            range.collapse(true);
          } else if (typeof pos === 'number') {
            const maxLen = el.firstChild.textContent?.length || 0;
            const targetPos = Math.min(pos, maxLen);
            range.setStart(el.firstChild, targetPos);
            range.collapse(true);
          } else {
            range.selectNodeContents(el);
            range.collapse(false);
          }
        } else {
          range.selectNodeContents(el);
          range.collapse(false);
        }

        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [focusedBlockId]);

  // Handle Drag & Drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedBlockId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id === draggedBlockId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const position = relativeY < rect.height / 2 ? 'above' : 'below';

    setDragOverBlockId(id);
    setDropPosition(position);
  };

  const handleDragLeave = () => {
    setDragOverBlockId(null);
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedBlockId || draggedBlockId === targetId) {
      setDraggedBlockId(null);
      setDragOverBlockId(null);
      setDropPosition(null);
      return;
    }

    const draggedIdx = blocks.findIndex(b => b.id === draggedBlockId);
    let targetIdx = blocks.findIndex(b => b.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    const updatedBlocks: RuntimeBlock[] = [...blocks];
    const [draggedBlock] = updatedBlocks.splice(draggedIdx, 1);

    targetIdx = updatedBlocks.findIndex(b => b.id === targetId);
    const insertIdx = dropPosition === 'above' ? targetIdx : targetIdx + 1;

    updatedBlocks.splice(insertIdx, 0, draggedBlock);
    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);

    setDraggedBlockId(null);
    setDragOverBlockId(null);
    setDropPosition(null);
  };

  // Keyboard actions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: RuntimeBlock, index: number) => {
    if (showAutocomplete) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
      if (filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAutocompleteIndex(prev => (prev + 1) % filteredSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAutocompleteIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          insertWikilink(filteredSuggestions[autocompleteIndex]);
          return;
        }
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const updatedBlocks: RuntimeBlock[] = [...blocks];
      const level = block.level ?? 0;

      if (e.shiftKey) {
        // Outdent (Shift + Tab)
        if (level > 0) {
          const nextLevel = level - 1;

          // Decrease level of this block
          updatedBlocks[index] = {
            ...block,
            level: nextLevel
          };

          // Decrease level of all descendants
          for (let i = index + 1; i < updatedBlocks.length; i++) {
            if ((updatedBlocks[i].level ?? 0) > level) {
              updatedBlocks[i] = {
                ...updatedBlocks[i],
                level: (updatedBlocks[i].level ?? 0) - 1
              };
            } else {
              break;
            }
          }

          const normalized = normalizeRuntimeBlocks(updatedBlocks);
          onChange(normalized);
        }
      } else {
        // Indent (Tab)
        // Can only indent if previous block has a level >= current block's level
        if (index > 0 && (updatedBlocks[index - 1].level ?? 0) >= level) {
          const nextLevel = level + 1;

          // Increase level of this block
          updatedBlocks[index] = {
            ...block,
            level: nextLevel
          };

          // Increase level of all descendants
          for (let i = index + 1; i < updatedBlocks.length; i++) {
            if ((updatedBlocks[i].level ?? 0) > level) {
              updatedBlocks[i] = {
                ...updatedBlocks[i],
                level: (updatedBlocks[i].level ?? 0) + 1
              };
            } else {
              break;
            }
          }

          const normalized = normalizeRuntimeBlocks(updatedBlocks);
          onChange(normalized);
        }
      }
    }

    if (e.key === 'Enter') {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();

        // Get cursor selection offset
        const selection = window.getSelection();
        let cursorOffset = 0;
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(e.currentTarget);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          cursorOffset = preCaretRange.toString().length;
        }

        const fullContent = e.currentTarget.innerText;

        // Case 3: Empty list-item
        if (block.type === 'list-item' && fullContent.trim() === '') {
          const updatedBlocks: RuntimeBlock[] = [...blocks];
          if ((block.level ?? 0) > 0) {
            // Outdent B
            const level = block.level ?? 0;
            const nextLevel = level - 1;
            updatedBlocks[index] = {
              ...block,
              level: nextLevel
            };
            // Outdent descendants if any
            for (let i = index + 1; i < updatedBlocks.length; i++) {
              if ((updatedBlocks[i].level ?? 0) > level) {
                updatedBlocks[i] = {
                  ...updatedBlocks[i],
                  level: (updatedBlocks[i].level ?? 0) - 1
                };
              } else {
                break;
              }
            }
            const normalized = normalizeRuntimeBlocks(updatedBlocks);
            onChange(normalized);
          } else {
            // Convert to paragraph
            updatedBlocks[index] = {
              ...block,
              type: 'paragraph'
            };
            const normalized = normalizeRuntimeBlocks(updatedBlocks);
            onChange(normalized);
          }
          return;
        }

        // Standard Split block
        const before = fullContent.substring(0, cursorOffset);
        const after = fullContent.substring(cursorOffset);

        const newId = `block://${Math.random().toString(36).substring(2, 10)}`;
        const updatedBlocks: RuntimeBlock[] = [...blocks];

        updatedBlocks[index] = {
          ...block,
          content: before
        };

        const newBlock: RuntimeBlock = {
          id: newId,
          type: block.type === 'list-item' ? 'list-item' : 'paragraph',
          level: block.level ?? 0,
          content: after,
          children: [],
          parentId: null,
          childrenIds: [],
          metadata: {
            sourceFile: block.metadata.sourceFile,
            lineStart: block.metadata.lineEnd + 1,
            lineEnd: block.metadata.lineEnd + 1,
            tags: [],
            references: []
          }
        };

        // Find insertion index after all B's descendants
        let insertIdx = index + 1;
        const level = block.level ?? 0;
        for (let i = index + 1; i < updatedBlocks.length; i++) {
          if ((updatedBlocks[i].level ?? 0) > level) {
            insertIdx = i + 1;
          } else {
            break;
          }
        }

        updatedBlocks.splice(insertIdx, 0, newBlock);
        const normalized = normalizeRuntimeBlocks(updatedBlocks);
        onChange(normalized);

        cursorPositionRef.current = 'start';
        setTimeout(() => {
          setFocusedBlockId(newId);
        }, 30);
      }
    }

    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      let cursorOffset = 0;
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(e.currentTarget);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        cursorOffset = preCaretRange.toString().length;
      }

      if (cursorOffset === 0) {
        e.preventDefault();
        const updatedBlocks: RuntimeBlock[] = [...blocks];
        const currentContent = e.currentTarget.innerText;

        if (currentContent === '') {
          // Case: Block is empty
          if ((block.level ?? 0) > 0) {
            // Outdent block
            const level = block.level ?? 0;
            const nextLevel = level - 1;
            updatedBlocks[index] = {
              ...block,
              level: nextLevel
            };
            for (let i = index + 1; i < updatedBlocks.length; i++) {
              if ((updatedBlocks[i].level ?? 0) > level) {
                updatedBlocks[i] = {
                  ...updatedBlocks[i],
                  level: (updatedBlocks[i].level ?? 0) - 1
                };
              } else {
                break;
              }
            }
            const normalized = normalizeRuntimeBlocks(updatedBlocks);
            onChange(normalized);
          } else {
            // Delete block if level is 0
            updatedBlocks.splice(index, 1);
            const normalized = normalizeRuntimeBlocks(updatedBlocks);
            onChange(normalized);

            if (index > 0) {
              cursorPositionRef.current = 'end';
              setFocusedBlockId(blocks[index - 1].id);
            }
          }
        } else if (index > 0) {
          // Case: Cursor is at start of a non-empty block
          const prevBlock = blocks[index - 1];
          if (prevBlock.type !== 'table' && prevBlock.type !== 'code') {
            const prevLength = prevBlock.content.length;

            // Merge content B into A
            updatedBlocks[index - 1] = {
              ...prevBlock,
              content: prevBlock.content + currentContent
            };

            // Shift levels of B's descendants to stay nested under the merged block
            const levelDiff = (prevBlock.level ?? 0) + 1 - (block.level ?? 0);
            const level = block.level ?? 0;
            for (let i = index + 1; i < updatedBlocks.length; i++) {
              if ((updatedBlocks[i].level ?? 0) > level) {
                updatedBlocks[i] = {
                  ...updatedBlocks[i],
                  level: (updatedBlocks[i].level ?? 0) + levelDiff
                };
              } else {
                break;
              }
            }

            // Remove block B
            updatedBlocks.splice(index, 1);
            const normalized = normalizeRuntimeBlocks(updatedBlocks);
            onChange(normalized);

            cursorPositionRef.current = prevLength;
            setFocusedBlockId(prevBlock.id);
          }
        }
      }
    }

    if (e.key === 'ArrowUp') {
      if (index > 0) {
        e.preventDefault();
        cursorPositionRef.current = 'end';
        setFocusedBlockId(blocks[index - 1].id);
      }
    }

    if (e.key === 'ArrowDown') {
      if (index < blocks.length - 1) {
        e.preventDefault();
        cursorPositionRef.current = 'end';
        setFocusedBlockId(blocks[index + 1].id);
      }
    }
  };

  const handleContentChange = (index: number, val: string) => {
    const updatedBlocks: RuntimeBlock[] = [...blocks];
    const inferred = inferBlockTypeAndMetadata(val);

    updatedBlocks[index] = {
      ...updatedBlocks[index],
      content: val,
      type: inferred.type as any,
      level: (inferred as any).level ?? updatedBlocks[index].level,
      info: (inferred as any).info ?? updatedBlocks[index].info,
      metadata: {
        ...updatedBlocks[index].metadata,
        checked: (inferred as any).checked
      }
    };
    onChange(updatedBlocks);
  };

  // Change Block Type and prepend formatting syntax
  const changeBlockType = (index: number, type: any, level?: number) => {
    const updatedBlocks: RuntimeBlock[] = [...blocks];
    const prevBlock = updatedBlocks[index];
    let content = prevBlock.content;

    // Strip leading block syntax prefixes to convert clean text
    const cleanContent = (text: string) => {
      return text.replace(/^(#{1,6}\s+|[-*+]\s+\[[ x]\]\s+|[-*+]\s+|>\s+\[![A-Z]+\s*\]|>\s+)/gm, '');
    };

    const rawText = cleanContent(content);

    switch (type) {
      case 'paragraph':
        content = rawText;
        break;
      case 'heading': {
        const hLevel = level || 1;
        content = '#'.repeat(hLevel) + ' ' + rawText;
        break;
      }
      case 'list-item': {
        if (level === 999) {
          content = '- [ ] ' + rawText;
        } else {
          content = '- ' + rawText;
        }
        break;
      }
      case 'quote':
        content = '> ' + rawText;
        break;
      case 'code':
        content = '```\n' + rawText + '\n```';
        break;
      case 'table':
        content = '| Cell 1 | Cell 2 |\n| --- | --- |\n| Data 1 | Data 2 |';
        break;
    }

    const inferred = inferBlockTypeAndMetadata(content);

    updatedBlocks[index] = {
      ...prevBlock,
      content,
      type: inferred.type as any,
      level: (inferred as any).level ?? prevBlock.level,
      info: (inferred as any).info ?? prevBlock.info,
      metadata: {
        ...prevBlock.metadata,
        checked: (inferred as any).checked
      }
    };

    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);
    setActiveMenuId(null);
  };

  const deleteBlock = (index: number) => {
    const updatedBlocks: RuntimeBlock[] = [...blocks];
    updatedBlocks.splice(index, 1);
    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);
    setActiveMenuId(null);
  };

  const insertBlockBelow = (index: number) => {
    const newId = `block://${Math.random().toString(36).substring(2, 10)}`;
    const updatedBlocks: RuntimeBlock[] = [...blocks];
    updatedBlocks.splice(index + 1, 0, {
      id: newId,
      type: 'paragraph',
      content: '',
      children: [],
      metadata: {
        sourceFile: blocks[index].metadata.sourceFile,
        lineStart: blocks[index].metadata.lineEnd + 1,
        lineEnd: blocks[index].metadata.lineEnd + 1,
        tags: [],
        references: []
      }
    });
    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);
    setTimeout(() => {
      setFocusedBlockId(newId);
    }, 30);
  };

  return (
    <div className="space-y-2 select-text min-h-[50vh] pb-[30vh]">
      {blocks.map((block, idx) => {
        const isFocused = focusedBlockId === block.id;
        const isDraggedOver = dragOverBlockId === block.id;
        const indentLevel = block.level ?? 0;

        // CSS Style for custom indentation level
        const blockStyle: React.CSSProperties = {
          marginLeft: `${indentLevel * 24}px`
        };

        // Determine specific classnames based on block type
        let textStyle = 'text-gray-300';
        if (block.type === 'heading') {
          const headingMatch = block.content.match(/^(#{1,6})\s+/);
          const headingLevel = headingMatch ? headingMatch[1].length : 1;
          const headingClasses = [
            'text-xl font-semibold text-gray-200 mt-2 mb-1', // fallback
            'text-3xl font-bold text-white mt-6 mb-2', // H1
            'text-2xl font-semibold text-white mt-4 mb-2', // H2
            'text-xl font-semibold text-gray-200 mt-2 mb-1', // H3
            'text-lg font-medium text-gray-200 mt-2 mb-1', // H4
            'text-md font-medium text-gray-300 mt-1 mb-1', // H5
            'text-sm font-medium text-gray-400 mt-1 mb-1'  // H6
          ];
          textStyle = headingClasses[headingLevel] || headingClasses[0];
        } else if (block.type === 'quote') {
          textStyle = 'text-gray-400 italic pl-4 border-l-4 border-blue-500/40 bg-white/5 py-1 rounded-r-lg';
        }

        return (
          <div
            key={block.id}
            style={blockStyle}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, block.id)}
            className={`group relative flex items-start gap-2 py-1 px-2 rounded-xl transition duration-150 border border-transparent ${isDraggedOver && dropPosition === 'above' ? 'border-t-blue-500 shadow-[0_-2px_0_rgba(59,130,246,0.5)]' : ''
              } ${isDraggedOver && dropPosition === 'below' ? 'border-b-blue-500 shadow-[0_2px_0_rgba(59,130,246,0.5)]' : ''
              } hover:bg-white/[0.02]`}
          >
            {/* Hover Side Handles */}
            <div className="absolute left-[-42px] top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 no-drag">
              <button
                onClick={() => insertBlockBelow(idx)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white cursor-pointer border-0 outline-none"
                title="Insert Block Below"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, block.id)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white cursor-grab active:cursor-grabbing"
                title="Drag to Reorder"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Editable Content Area */}
            <div className="flex-1 min-w-0" onClick={() => setFocusedBlockId(block.id)}>
              {block.type === 'table' ? (
                isFocused ? (
                  <TableBlock
                    content={block.content}
                    onChange={(val) => handleContentChange(idx, val)}
                  />
                ) : (
                  <div className="cursor-text">
                    <RenderParsedBlock
                      content={block.content}
                      onWikilinkClick={onWikilinkClick}
                      onHashtagClick={onHashtagClick}
                      resolveLinkPath={resolveLinkPath}
                      onContentChange={(val) => handleContentChange(idx, val)}
                    />
                  </div>
                )
              ) : block.type === 'code' ? (
                isFocused ? (
                  <CodeBlock
                    content={block.content}
                    info={block.info}
                    onChange={(val) => handleContentChange(idx, val)}
                    onInfoChange={(lang) => {
                      const updated = [...blocks];
                      updated[idx] = { ...updated[idx], info: lang };
                      onChange(updated);
                    }}
                  />
                ) : (
                  <div className="cursor-text">
                    <RenderParsedBlock
                      content={`\`\`\`${block.info || ''}\n${block.content}\n\`\`\``}
                      onWikilinkClick={onWikilinkClick}
                      onHashtagClick={onHashtagClick}
                      resolveLinkPath={resolveLinkPath}
                      onContentChange={(val) => handleContentChange(idx, val)}
                    />
                  </div>
                )
              ) : (
                isFocused ? (
                  <div
                    ref={(el) => { blockRefs.current[block.id] = el; }}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setFocusedBlockId(block.id)}
                    onBlur={(e) => {
                      setFocusedBlockId(null);
                      handleContentChange(idx, e.currentTarget.innerText);
                      setShowAutocomplete(false);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, block, idx)}
                    onInput={() => checkAutocompleteTrigger(block, idx)}
                    onKeyUp={() => checkAutocompleteTrigger(block, idx)}
                    style={{ whiteSpace: 'pre-wrap' }}
                    className={`outline-none leading-7 text-[16px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-600 empty:before:pointer-events-none select-text ${textStyle} ${block.metadata.checked ? 'line-through text-gray-500' : ''
                      }`}
                    data-placeholder="Press Ctrl+Enter for a new block, or start typing..."
                  >
                    {block.content}
                  </div>
                ) : (
                  <div className="cursor-text min-h-[28px]">
                    {block.content.trim() === '' ? (
                      <span className="text-gray-600 italic select-none">Click to write...</span>
                    ) : (
                      <RenderParsedBlock
                        content={block.content}
                        onWikilinkClick={onWikilinkClick}
                        onHashtagClick={onHashtagClick}
                        resolveLinkPath={resolveLinkPath}
                        onContentChange={(val) => handleContentChange(idx, val)}
                      />
                    )}
                  </div>
                )
              )}
            </div>

            {/* Side Menu Trigger */}
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 self-center">
              <div className="relative">
                <button
                  onClick={() => setActiveMenuId(activeMenuId === block.id ? null : block.id)}
                  className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white cursor-pointer border-0 outline-none text-xs"
                >
                  •••
                </button>

                {activeMenuId === block.id && (
                  <div className="absolute right-0 top-7 z-30 min-w-[160px] bg-[#1a1d26]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider px-2 py-1 border-b border-white/5 mb-1">
                      Convert to
                    </div>
                    <button
                      onClick={() => changeBlockType(idx, 'paragraph')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Type className="w-3.5 h-3.5 text-gray-400" />
                      <span>Paragraph</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'heading', 1)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Heading1 className="w-3.5 h-3.5 text-gray-400" />
                      <span>Heading 1</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'heading', 2)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Heading2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>Heading 2</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'heading', 3)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Heading3 className="w-3.5 h-3.5 text-gray-400" />
                      <span>Heading 3</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'list-item')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <List className="w-3.5 h-3.5 text-gray-400" />
                      <span>Bullet List</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'list-item', 999)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-gray-400" />
                      <span>Checklist</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'quote')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Quote className="w-3.5 h-3.5 text-gray-400" />
                      <span>Quote</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'code')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Code className="w-3.5 h-3.5 text-gray-400" />
                      <span>Code Block</span>
                    </button>
                    <button
                      onClick={() => changeBlockType(idx, 'table')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <TableIcon className="w-3.5 h-3.5 text-gray-400" />
                      <span>Table</span>
                    </button>
                    <div className="h-px bg-white/5 my-1" />
                    <button
                      onClick={() => deleteBlock(idx)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition text-left border-0 outline-none cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Block</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {showAutocomplete && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: autocompleteCoords.x,
            top: autocompleteCoords.y,
            zIndex: 1000,
          }}
          className="w-64 bg-[#1a1d26]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-1.5 flex flex-col gap-0.5 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          {filteredSuggestions.map((suggestion, index) => {
            const isActive = index === autocompleteIndex;
            return (
              <div
                key={suggestion}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertWikilink(suggestion);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition text-left truncate ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
              >
                {suggestion}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Visual Table Block Editor Component
const TableBlock: React.FC<{ content: string; onChange: (val: string) => void }> = ({ content, onChange }) => {
  const grid = useMemo(() => {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [['Cell 1', 'Cell 2'], ['Data 1', 'Data 2']];

    const parseRow = (row: string) => {
      let clean = row;
      if (clean.startsWith('|')) clean = clean.slice(1);
      if (clean.endsWith('|')) clean = clean.slice(0, -1);
      return clean.split('|').map(c => c.trim());
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(2).map(parseRow);
    return [headers, ...rows];
  }, [content]);

  const handleCellChange = (rowIdx: number, colIdx: number, val: string) => {
    const updatedGrid = grid.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIdx && cIdx === colIdx ? val : cell))
    );

    const headers = updatedGrid[0];
    const rows = updatedGrid.slice(1);
    const headerStr = '| ' + headers.join(' | ') + ' |';
    const separatorStr = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const rowsStr = rows.map(r => '| ' + r.join(' | ') + ' |');

    onChange([headerStr, separatorStr, ...rowsStr].join('\n'));
  };

  const addRow = () => {
    const colCount = grid[0]?.length || 2;
    const newRow = Array(colCount).fill('');
    const newGrid = [...grid, newRow];

    const headers = newGrid[0];
    const rows = newGrid.slice(1);
    const headerStr = '| ' + headers.join(' | ') + ' |';
    const separatorStr = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const rowsStr = rows.map(r => '| ' + r.join(' | ') + ' |');

    onChange([headerStr, separatorStr, ...rowsStr].join('\n'));
  };

  const addColumn = () => {
    const newGrid = grid.map(row => [...row, '']);

    const headers = newGrid[0];
    const rows = newGrid.slice(1);
    const headerStr = '| ' + headers.join(' | ') + ' |';
    const separatorStr = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const rowsStr = rows.map(r => '| ' + r.join(' | ') + ' |');

    onChange([headerStr, separatorStr, ...rowsStr].join('\n'));
  };

  return (
    <div className="my-3 overflow-x-auto border border-white/10 rounded-xl bg-white/5 p-4 no-drag">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            {grid[0]?.map((header, colIdx) => (
              <th
                key={colIdx}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleCellChange(0, colIdx, e.currentTarget.innerText)}
                className="border border-white/10 p-2 text-left bg-[#1c1f2a] text-white outline-none min-w-[80px]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.slice(1).map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleCellChange(rowIdx + 1, colIdx, e.currentTarget.innerText)}
                  className="border border-white/10 p-2 text-gray-300 outline-none min-w-[80px]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 mt-3 select-none">
        <button
          onClick={addRow}
          className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 cursor-pointer border-0 outline-none"
        >
          + Add Row
        </button>
        <button
          onClick={addColumn}
          className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 cursor-pointer border-0 outline-none"
        >
          + Add Column
        </button>
      </div>
    </div>
  );
};

// Code Block Editor Component
const CodeBlock: React.FC<{
  content: string;
  info?: string;
  onChange: (val: string) => void;
  onInfoChange: (lang: string) => void;
}> = ({ content, info, onChange, onInfoChange }) => {
  return (
    <div className="my-3 border border-white/10 rounded-xl bg-[#181b24] p-4 font-mono text-sm no-drag">
      <div className="flex justify-between items-center mb-2 select-none">
        <input
          type="text"
          value={info || ''}
          onChange={(e) => onInfoChange(e.target.value)}
          placeholder="Language (e.g. javascript)"
          className="bg-transparent border-b border-white/10 text-gray-400 outline-none text-xs w-48 pb-0.5"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#10121a] p-3 rounded-lg border border-white/5 text-gray-300 font-mono text-sm outline-none resize-y min-h-[100px] leading-6"
        placeholder="Write code here..."
      />
    </div>
  );
};
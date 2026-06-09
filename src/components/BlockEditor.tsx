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
  Quote 
} from 'lucide-react';
import { normalizeRuntimeBlocks } from '../runtime/parser/runtime-normalizer';
import type { RuntimeBlock } from '../runtime/types/runtime-types';

interface BlockEditorProps {
  blocks: RuntimeBlock[];
  onChange: (updatedBlocks: RuntimeBlock[]) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ blocks, onChange }) => {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Maintain focus and place cursor at the end when focusedBlockId changes
  useEffect(() => {
    if (focusedBlockId && blockRefs.current[focusedBlockId]) {
      const el = blockRefs.current[focusedBlockId];
      if (el && document.activeElement !== el) {
        el.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false); // cursor at the end
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

    const updatedBlocks = [...blocks];
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
    if (e.key === 'Tab') {
      e.preventDefault();
      const updatedBlocks = [...blocks];
      const level = block.level ?? 0;
      if (e.shiftKey) {
        // Shift+Tab: Outdent
        if (level > 0) {
          updatedBlocks[index] = { ...block, level: level - 1 };
        }
      } else {
        // Tab: Indent
        updatedBlocks[index] = { ...block, level: level + 1 };
      }
      const normalized = normalizeRuntimeBlocks(updatedBlocks);
      onChange(normalized);
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newId = `block://${Math.random().toString(36).substring(2, 10)}`;

      const newBlock: RuntimeBlock = {
        id: newId,
        type: block.type === 'list-item' ? 'list-item' : 'paragraph',
        level: block.level ?? 0,
        content: '',
        children: [],
        metadata: {
          sourceFile: block.metadata.sourceFile,
          lineStart: block.metadata.lineEnd + 1,
          lineEnd: block.metadata.lineEnd + 1,
          tags: [],
          references: [],
          checked: block.type === 'list-item' && block.metadata.checked !== undefined ? false : undefined
        }
      };

      const updatedBlocks = [...blocks];
      updatedBlocks.splice(index + 1, 0, newBlock);
      const normalized = normalizeRuntimeBlocks(updatedBlocks);
      onChange(normalized);

      setTimeout(() => {
        setFocusedBlockId(newId);
      }, 30);
    }

    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      const cursorOffset = selection?.anchorOffset ?? 0;

      if (cursorOffset === 0 && block.content === '') {
        e.preventDefault();
        const updatedBlocks = [...blocks];
        updatedBlocks.splice(index, 1);
        const normalized = normalizeRuntimeBlocks(updatedBlocks);
        onChange(normalized);

        if (index > 0) {
          setFocusedBlockId(blocks[index - 1].id);
        }
      } else if (cursorOffset === 0 && index > 0) {
        const prevBlock = blocks[index - 1];
        if (prevBlock.type !== 'table' && prevBlock.type !== 'code') {
          e.preventDefault();
          const prevLength = prevBlock.content.length;
          const updatedBlocks = [...blocks];
          updatedBlocks[index - 1] = {
            ...prevBlock,
            content: prevBlock.content + block.content
          };
          updatedBlocks.splice(index, 1);
          const normalized = normalizeRuntimeBlocks(updatedBlocks);
          onChange(normalized);

          setFocusedBlockId(prevBlock.id);
          setTimeout(() => {
            const el = blockRefs.current[prevBlock.id];
            if (el) {
              const range = document.createRange();
              const sel = window.getSelection();
              if (el.firstChild) {
                range.setStart(el.firstChild, prevLength);
                range.collapse(true);
              } else {
                range.selectNodeContents(el);
                range.collapse(false);
              }
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }, 30);
        }
      }
    }

    if (e.key === 'ArrowUp') {
      if (index > 0) {
        e.preventDefault();
        setFocusedBlockId(blocks[index - 1].id);
      }
    }

    if (e.key === 'ArrowDown') {
      if (index < blocks.length - 1) {
        e.preventDefault();
        setFocusedBlockId(blocks[index + 1].id);
      }
    }
  };

  const handleContentChange = (index: number, val: string) => {
    const updatedBlocks = [...blocks];
    updatedBlocks[index] = {
      ...updatedBlocks[index],
      content: val
    };
    onChange(updatedBlocks);
  };

  // Change Block Type
  const changeBlockType = (index: number, type: any, level?: number) => {
    const updatedBlocks = [...blocks];
    const prevBlock = updatedBlocks[index];
    
    updatedBlocks[index] = {
      ...prevBlock,
      type,
      level: level !== undefined ? level : (type === 'heading' ? 1 : prevBlock.level),
      metadata: {
        ...prevBlock.metadata,
        checked: type === 'list-item' && level === 999 ? false : undefined // Special checklist tag
      }
    };
    // If checklist was chosen, normalize it back to list-item
    if (type === 'list-item' && level === 999) {
      updatedBlocks[index].level = 0;
    }

    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);
    setActiveMenuId(null);
  };

  const deleteBlock = (index: number) => {
    const updatedBlocks = [...blocks];
    updatedBlocks.splice(index, 1);
    const normalized = normalizeRuntimeBlocks(updatedBlocks);
    onChange(normalized);
    setActiveMenuId(null);
  };

  const insertBlockBelow = (index: number) => {
    const newId = `block://${Math.random().toString(36).substring(2, 10)}`;
    const updatedBlocks = [...blocks];
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

  const toggleCheckbox = (index: number) => {
    const updatedBlocks = [...blocks];
    const block = updatedBlocks[index];
    updatedBlocks[index] = {
      ...block,
      metadata: {
        ...block.metadata,
        checked: !block.metadata.checked
      }
    };
    onChange(updatedBlocks);
  };

  return (
    <div className="space-y-2 select-text pb-20">
      {blocks.map((block, idx) => {
        const isFocused = focusedBlockId === block.id;
        const isDraggedOver = dragOverBlockId === block.id;
        const level = block.level ?? 0;
        
        let indentationClass = '';
        if (level > 0) {
          indentationClass = `pl-${Math.min(level * 4, 16)}`;
        }
        
        // CSS Style for custom indentation level
        const blockStyle: React.CSSProperties = {
          marginLeft: `${level * 24}px`
        };

        // Determine specific classnames based on block type
        let textStyle = 'text-gray-300';
        if (block.type === 'heading') {
          if (block.level === 1) textStyle = 'text-3xl font-bold text-white mt-6 mb-2';
          else if (block.level === 2) textStyle = 'text-2xl font-semibold text-white mt-4 mb-2';
          else textStyle = 'text-xl font-semibold text-gray-200 mt-2 mb-1';
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
            className={`group relative flex items-start gap-2 py-1 px-2 rounded-xl transition duration-150 border border-transparent ${
              isDraggedOver && dropPosition === 'above' ? 'border-t-blue-500 shadow-[0_-2px_0_rgba(59,130,246,0.5)]' : ''
            } ${
              isDraggedOver && dropPosition === 'below' ? 'border-b-blue-500 shadow-[0_2px_0_rgba(59,130,246,0.5)]' : ''
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

            {/* Block Type Indicators & Bullets */}
            <div className="flex items-center justify-center shrink-0 w-6 h-6 mt-1 select-none">
              {block.type === 'list-item' && block.metadata.checked === undefined && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
              {block.type === 'list-item' && block.metadata.checked !== undefined && (
                <input
                  type="checkbox"
                  checked={!!block.metadata.checked}
                  onChange={() => toggleCheckbox(idx)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer rounded border-white/20"
                />
              )}
              {block.type === 'heading' && (
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">H{block.level}</span>
              )}
            </div>

            {/* Editable Content Area */}
            <div className="flex-1 min-w-0">
              {block.type === 'table' ? (
                <TableBlock 
                  content={block.content} 
                  onChange={(val) => handleContentChange(idx, val)} 
                />
              ) : block.type === 'code' ? (
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
                <div
                  ref={(el) => { blockRefs.current[block.id] = el; }}
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={() => setFocusedBlockId(block.id)}
                  onBlur={(e) => handleContentChange(idx, e.currentTarget.innerText)}
                  onKeyDown={(e) => handleKeyDown(e, block, idx)}
                  className={`outline-none leading-7 text-[16px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-600 empty:before:pointer-events-none select-text ${textStyle} ${
                    block.metadata.checked ? 'line-through text-gray-500' : ''
                  }`}
                  data-placeholder={
                    block.type === 'heading' 
                      ? `Heading ${block.level}` 
                      : block.type === 'quote' 
                        ? 'Quote' 
                        : 'Press "/" or start typing...'
                  }
                >
                  {block.content}
                </div>
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
    // Index 1 is separator, data rows start at index 2
    const rows = lines.slice(2).map(parseRow);
    return [headers, ...rows];
  }, [content]);

  const handleCellChange = (rowIdx: number, colIdx: number, val: string) => {
    const updatedGrid = grid.map((row, rIdx) =>
      row.map((cell, cIdx) => (rIdx === rowIdx && cIdx === colIdx ? val : cell))
    );
    
    // Serialize
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
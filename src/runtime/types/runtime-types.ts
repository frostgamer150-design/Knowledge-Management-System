export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'quote'
  | 'code'
  | 'table'
  | 'callout'
  | 'empty';

export type InlineNodeType =
  | 'text'
  | 'wikilink'
  | 'embed'
  | 'hashtag'
  | 'bold'
  | 'italic'
  | 'code';

export interface InlineNode {
  type: InlineNodeType;
  content: string; // text content or link target
  raw: string; // raw markdown text matching this node
}

export interface BlockMetadata {
  sourceFile: string; // relative path
  lineStart: number; // 1-based start line
  lineEnd: number; // 1-based end line
  parentId?: string; // parent block ID (e.g. for nested lists)
  tags: string[];
  references: string[]; // wikilinks
}

export interface RuntimeBlock {
  id: string; // block://<hash>
  type: BlockType;
  level?: number; // heading level (1, 2, 3) or list indentation depth
  content: string; // raw inner text
  children: InlineNode[]; // parsed inline children
  metadata: BlockMetadata;
}

export interface RuntimeDocument {
  path: string; // relative path
  title: string;
  blocks: RuntimeBlock[];
  tags: string[];
  references: string[]; // unique list of wikilinks in this document
  wordCount: number;
  charCount: number;
}

export type GraphNodeType = 'document' | 'block' | 'tag';

export interface GraphNode {
  id: string; // "doc://path" or "block://hash" or "tag://name"
  type: GraphNodeType;
  name: string; // readable title/label
}

export interface GraphEdge {
  source: string; // source node ID
  target: string; // target node ID
  type: 'link' | 'embed' | 'tag' | 'block-ref';
}
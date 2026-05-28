import type { RuntimeDocument } from '../types/runtime-types';
import { BlockRegistry } from '../store/block-registry';
import { BlockRuntime } from '../store/block-runtime';
import { GraphRuntime } from '../graph/graph-runtime';
import { RelationshipIndex } from '../graph/relationship-index';
import { resolveLinkPath } from '../graph/link-resolver';
import { diffBlocks } from './block-diff';

/**
 * Synchronizes document updates to the BlockRegistry, GraphRuntime, and RelationshipIndex.
 * Fires lifecycle notifications for blocks that were added, removed, or updated.
 */
export function syncDocumentRuntime(
  filePath: string,
  oldDoc: RuntimeDocument | null,
  newDoc: RuntimeDocument | null,
  allPaths: string[]
): void {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const registry = BlockRegistry.getInstance();
  const blockRuntime = BlockRuntime.getInstance();
  const graph = GraphRuntime.getInstance();
  const index = RelationshipIndex.getInstance();

  const docNodeId = `doc://${normalizedPath}`;

  // 1. Handle Document Deletion
  if (!newDoc) {
    if (oldDoc) {
      // Notify deletion of all blocks
      for (const block of oldDoc.blocks) {
        blockRuntime.notifyDeleted(block.id);
      }
    }
    registry.unregisterFile(normalizedPath);
    index.unregisterFile(normalizedPath);
    graph.removeNode(docNodeId);
    return;
  }

  // 2. Register Blocks in Global Registry
  registry.registerBlocks(normalizedPath, newDoc.blocks);

  // 3. Resolve References and update Relationship Index
  const resolvedTargets: string[] = [];
  for (const ref of newDoc.references) {
    const resolved = resolveLinkPath(ref, normalizedPath, allPaths);
    if (resolved) {
      resolvedTargets.push(resolved);
    }
  }
  index.registerFileRelations(normalizedPath, resolvedTargets, newDoc.tags);

  // 4. Update Knowledge Graph Runtime
  // Add/Update Document Node
  graph.addNode({
    id: docNodeId,
    type: 'document',
    name: newDoc.title
  });

  // Remove existing edges for this document to rebuild them cleanly
  graph.removeNode(docNodeId); // Re-registers node and clears out edges
  graph.addNode({
    id: docNodeId,
    type: 'document',
    name: newDoc.title
  });

  // Re-add edges: document -> tag
  for (const tag of newDoc.tags) {
    const tagNodeId = `tag://${tag}`;
    graph.addNode({
      id: tagNodeId,
      type: 'tag',
      name: `#${tag}`
    });
    graph.addEdge({
      source: docNodeId,
      target: tagNodeId,
      type: 'tag'
    });
  }

  // Re-add edges: document -> document (Wikilinks)
  for (const target of resolvedTargets) {
    const targetNodeId = `doc://${target}`;
    graph.addEdge({
      source: docNodeId,
      target: targetNodeId,
      type: 'link'
    });
  }

  // Re-add block nodes and link document -> block
  for (const block of newDoc.blocks) {
    graph.addNode({
      id: block.id,
      type: 'block',
      name: block.type
    });
    graph.addEdge({
      source: docNodeId,
      target: block.id,
      type: 'block-ref'
    });

    // Also link block -> block if parentId exists
    if (block.metadata.parentId) {
      graph.addEdge({
        source: block.metadata.parentId,
        target: block.id,
        type: 'block-ref'
      });
    }
  }

  // 5. Calculate Block Diffs and Notify Lifecycle Listeners
  const oldBlocks = oldDoc ? oldDoc.blocks : [];
  const { added, removed, updated } = diffBlocks(oldBlocks, newDoc.blocks);

  for (const block of added) {
    blockRuntime.notifyCreated(block);
  }
  for (const block of updated) {
    blockRuntime.notifyUpdated(block);
  }
  for (const id of removed) {
    blockRuntime.notifyDeleted(id);
  }
}

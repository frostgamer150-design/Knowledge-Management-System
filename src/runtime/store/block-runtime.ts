import type { RuntimeBlock } from '../types/runtime-types';

export type BlockLifecycleListener = {
  created?: (block: RuntimeBlock) => void;
  updated?: (block: RuntimeBlock) => void;
  deleted?: (blockId: string) => void;
};

/**
 * Manages block lifecycle events (create, update, delete) and allows modules to subscribe to these events.
 */
export class BlockRuntime {
  private static instance: BlockRuntime | null = null;
  private listeners = new Set<BlockLifecycleListener>();

  private constructor() {}

  public static getInstance(): BlockRuntime {
    if (!BlockRuntime.instance) {
      BlockRuntime.instance = new BlockRuntime();
    }
    return BlockRuntime.instance;
  }

  /**
   * Subscribes to block lifecycle events. Returns an unsubscribe function.
   */
  public subscribe(listener: BlockLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emits a block creation event.
   */
  public notifyCreated(block: RuntimeBlock): void {
    for (const listener of this.listeners) {
      if (listener.created) listener.created(block);
    }
  }

  /**
   * Emits a block update event.
   */
  public notifyUpdated(block: RuntimeBlock): void {
    for (const listener of this.listeners) {
      if (listener.updated) listener.updated(block);
    }
  }

  /**
   * Emits a block deletion event.
   */
  public notifyDeleted(blockId: string): void {
    for (const listener of this.listeners) {
      if (listener.deleted) listener.deleted(blockId);
    }
  }
}

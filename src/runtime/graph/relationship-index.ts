/**
 * In-Memory Indexes for fast lookups of Backlinks and Tag connections.
 */
export class RelationshipIndex {
  private static instance: RelationshipIndex | null = null;

  // Map of normalized target path -> Set of source paths referencing it (Backlinks)
  private backlinks = new Map<string, Set<string>>();
  // Map of source path -> Set of target paths it references
  private forwardReferences = new Map<string, Set<string>>();
  // Map of tag name -> Set of file paths containing this tag
  private tagIndex = new Map<string, Set<string>>();
  // Map of file path -> Set of tags it contains
  private fileTags = new Map<string, Set<string>>();

  private constructor() {}

  public static getInstance(): RelationshipIndex {
    if (!RelationshipIndex.instance) {
      RelationshipIndex.instance = new RelationshipIndex();
    }
    return RelationshipIndex.instance;
  }

  /**
   * Registers references and tags for a source file.
   * Removes previous relationships associated with that source file.
   * @param sourceFile relative path of the file
   * @param resolvedTargets resolved relative paths that this file references
   * @param tags tags present in this file
   */
  public registerFileRelations(
    sourceFile: string,
    resolvedTargets: string[],
    tags: string[]
  ): void {
    const src = sourceFile.replace(/\\/g, '/');
    this.unregisterFile(src);

    // 1. Setup forward and backward references
    const targetsSet = new Set<string>();
    for (const target of resolvedTargets) {
      const dest = target.replace(/\\/g, '/');
      targetsSet.add(dest);

      if (!this.backlinks.has(dest)) {
        this.backlinks.set(dest, new Set());
      }
      this.backlinks.get(dest)!.add(src);
    }
    this.forwardReferences.set(src, targetsSet);

    // 2. Setup tag indexes
    const tagsSet = new Set<string>();
    for (const tag of tags) {
      const normalizedTag = tag.toLowerCase();
      tagsSet.add(normalizedTag);

      if (!this.tagIndex.has(normalizedTag)) {
        this.tagIndex.set(normalizedTag, new Set());
      }
      this.tagIndex.get(normalizedTag)!.add(src);
    }
    this.fileTags.set(src, tagsSet);
  }

  /**
   * Cleans up all index associations for a specific file.
   */
  public unregisterFile(sourceFile: string): void {
    const src = sourceFile.replace(/\\/g, '/');

    // 1. Cleanup backlinks where this file was the source
    const targets = this.forwardReferences.get(src);
    if (targets) {
      for (const dest of targets) {
        const sources = this.backlinks.get(dest);
        if (sources) {
          sources.delete(src);
          if (sources.size === 0) {
            this.backlinks.delete(dest);
          }
        }
      }
      this.forwardReferences.delete(src);
    }

    // 2. Cleanup backlinks pointing to this file (in case the file itself is deleted)
    this.backlinks.delete(src);

    // 3. Cleanup tag indexes
    const tags = this.fileTags.get(src);
    if (tags) {
      for (const tag of tags) {
        const files = this.tagIndex.get(tag);
        if (files) {
          files.delete(src);
          if (files.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
      this.fileTags.delete(src);
    }
  }

  /**
   * Returns a list of relative file paths referencing the target file.
   */
  public getBacklinks(targetFile: string): string[] {
    const dest = targetFile.replace(/\\/g, '/');
    const sources = this.backlinks.get(dest);
    return sources ? Array.from(sources) : [];
  }

  /**
   * Returns a list of file paths that contain the specified tag.
   */
  public getFilesWithTag(tag: string): string[] {
    const files = this.tagIndex.get(tag.toLowerCase());
    return files ? Array.from(files) : [];
  }

  /**
   * Gets all tags used in the workspace.
   */
  public getAllTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }

  /**
   * Clears the entire relationship index.
   */
  public clear(): void {
    this.backlinks.clear();
    this.forwardReferences.clear();
    this.tagIndex.clear();
    this.fileTags.clear();
  }
}

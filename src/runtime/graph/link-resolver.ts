import { parseReferenceTarget } from './reference-extractor';

/**
 * Resolves a Wikilink target to the actual relative path of the target file in the vault.
 * Handles relative directories, exact names, and fallback search across all file paths.
 */
export function resolveLinkPath(
  target: string,
  sourceFile: string,
  allPaths: string[]
): string | null {
  const { targetFile } = parseReferenceTarget(target);
  if (!targetFile) return null;

  // Normalize paths using forward slashes
  const normalizedTarget = targetFile.replace(/\\/g, '/');
  const targetWithExt = normalizedTarget.endsWith('.md') ? normalizedTarget : `${normalizedTarget}.md`;

  // 1. Resolve relative to the source file's directory
  const sourceDir = sourceFile.includes('/') ? sourceFile.substring(0, sourceFile.lastIndexOf('/')) : '';
  const relativeTarget = sourceDir ? `${sourceDir}/${targetWithExt}` : targetWithExt;
  if (allPaths.includes(relativeTarget)) {
    return relativeTarget;
  }

  // 2. Check if it's an exact match from the root of the vault
  if (allPaths.includes(targetWithExt)) {
    return targetWithExt;
  }

  // 3. Search for a file with the same filename in any directory (Obsidian-style fallback)
  const targetFileName = targetWithExt.includes('/')
    ? targetWithExt.substring(targetWithExt.lastIndexOf('/') + 1)
    : targetWithExt;

  for (const path of allPaths) {
    const pathFileName = path.includes('/')
      ? path.substring(path.lastIndexOf('/') + 1)
      : path;
    if (pathFileName.toLowerCase() === targetFileName.toLowerCase()) {
      return path;
    }
  }

  return null;
}
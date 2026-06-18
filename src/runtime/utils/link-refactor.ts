import { fileService } from '../../file_Service';
import { SyncManager } from '../sync/sync-manager';
import { RelationshipIndex } from '../graph/relationship-index';
import { resolveLinkPath } from '../graph/link-resolver';
import { parseReferenceTarget } from '../graph/reference-extractor';

/**
 * Automatically updates wikilinks pointing to a renamed file inside all other referencing files.
 */
export async function refactorLinksOnRename(
  oldPath: string,
  newPath: string,
  allPaths: string[]
): Promise<void> {
  const normOldPath = oldPath.replace(/\\/g, '/');
  const normNewPath = newPath.replace(/\\/g, '/');
  
  // Get all files that have links pointing to the old path
  const backlinks = RelationshipIndex.getInstance().getBacklinks(normOldPath);
  if (backlinks.length === 0) return;

  const oldFileName = normOldPath.split('/').pop()?.replace(/\.md$/i, '') || '';
  const newFileName = normNewPath.split('/').pop()?.replace(/\.md$/i, '') || '';

  for (const refPath of backlinks) {
    try {
      const content = await fileService.readFile(refPath);
      
      // Regex to find all wikilinks: [[link]] or ![[link]]
      const updatedContent = content.replace(/(!?\[\[)([^\]]+)(\]\])/g, (match, prefix, target, suffix) => {
        const { targetFile, anchor } = parseReferenceTarget(target);
        if (!targetFile) return match;

        // Resolve this link to see if it points to the old path
        const resolved = resolveLinkPath(target, refPath, allPaths);
        if (resolved === normOldPath) {
          // Construct the new target
          let newTargetFile = targetFile;
          
          if (targetFile.includes('/')) {
            // It has a directory structure, use the new path (without .md)
            newTargetFile = normNewPath.replace(/\.md$/i, '');
          } else {
            // It's just a filename, use the new filename
            newTargetFile = newFileName;
          }
          
          // Re-append anchor if present
          const newTarget = anchor ? `${newTargetFile}#${anchor}` : newTargetFile;
          return `${prefix}${newTarget}${suffix}`;
        }
        
        return match;
      });

      if (updatedContent !== content) {
        // Write the updated content back to the file
        await fileService.writeFile(refPath, updatedContent);
        
        // Sync the changes immediately in SyncManager
        SyncManager.getInstance().handleFileChange(refPath, updatedContent, allPaths);
      }
    } catch (err) {
      console.error(`Failed to refactor links in file: ${refPath}`, err);
    }
  }
}

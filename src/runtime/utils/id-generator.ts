/**
 * Generates a stable and unique ID for a block based on its file path, relative index, and content.
 * Using a simple and fast FNV-1a 32-bit hash algorithm.
 */
export function generateBlockId(filePath: string, index: number, content: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedContent = content.trim();
  const input = `${normalizedPath}:${index}:${normalizedContent}`;

  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime (16777619)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  // Convert to 32-bit unsigned hex string
  const unsignedHash = hash >>> 0;
  return `block://${unsignedHash.toString(16)}`;
}

/**
 * Utilities for parsing and rendering markdown with wikilinks and hashtags.
 */

export function extractTags(content: string): string[] {
  // Avoid matching colors like #0f1117 or code block comments
  // Matches tags like #notes, #knowledge, #vault
  const regex = /(?:^|\s)#([a-zA-Z0-9_-]+)(?=\s|$)/g;
  const tags: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return Array.from(new Set(tags));
}

export function extractWikilinks(content: string): string[] {
  // Matches [[Note Name]] or [[Folder/Note Name]]
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return Array.from(new Set(links));
}

/**
 * A basic, fast markdown to HTML renderer that renders standard elements
 * and transforms [[Wikilinks]] and #tags into interactive elements.
 */
export function renderMarkdownToHtml(
  content: string,
  _onLinkClick: (noteName: string) => void,
  _onTagClick: (tagName: string) => void
): string {
  let html = content;

  // Escape HTML tags to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Pre-process code blocks
  const codeBlocks: string[] = [];
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(
      `<pre class="bg-[#181b24] p-4 rounded-xl border border-white/5 overflow-x-auto my-4 text-sm font-mono text-gray-300"><code>${code.trim()}</code></pre>`
    );
    return placeholder;
  });

  // Pre-process inline code
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
    inlineCodes.push(
      `<code class="bg-[#1e2230] text-blue-300 px-1.5 py-0.5 rounded font-mono text-sm">${code}</code>`
    );
    return placeholder;
  });

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 class="text-md font-semibold text-white mt-6 mb-2">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 class="text-lg font-semibold text-white mt-8 mb-3 border-b border-white/5 pb-2">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 class="text-2xl font-bold text-white mt-8 mb-4">$1</h2>');

  // Bold and Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-gray-300">$1</em>');

  // Task Lists
  html = html.replace(/^- \[x\] (.*$)/gim, '<li class="list-none flex items-start gap-2 text-gray-400 line-through"><input type="checkbox" checked disabled class="mt-1.5 accent-blue-500 rounded"> <span>$1</span></li>');
  html = html.replace(/^- \[ \] (.*$)/gim, '<li class="list-none flex items-start gap-2 text-gray-300"><input type="checkbox" disabled class="mt-1.5 accent-blue-500 rounded"> <span>$1</span></li>');

  // Unordered Lists
  html = html.replace(/^- (.*$)/gim, '<li class="list-disc ml-5 mb-1 text-gray-300">$1</li>');

  // Paragraphs (wrap lines that don't start with tags)
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line &&
      !line.startsWith('<h') &&
      !line.startsWith('<li') &&
      !line.startsWith('<pre') &&
      !line.startsWith('__CODE') &&
      !line.startsWith('__INLINE')
    ) {
      lines[i] = `<p class="mb-4 text-gray-300 leading-relaxed">${lines[i]}</p>`;
    }
  }
  html = lines.join('\n');

  // Restore inline codes
  inlineCodes.forEach((codeHtml, idx) => {
    html = html.replace(`__INLINE_CODE_PLACEHOLDER_${idx}__`, codeHtml);
  });

  // Restore code blocks
  codeBlocks.forEach((codeHtml, idx) => {
    html = html.replace(`__CODE_BLOCK_PLACEHOLDER_${idx}__`, codeHtml);
  });

  // Wikilinks: [[link]] -> custom triggerable link
  // Note: we'll render them as HTML tags with custom attributes, and then bind them or let the renderer handle clicking.
  // We can render them as: <span class="wikilink text-blue-400 hover:underline cursor-pointer" data-link="Link">Link</span>
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_, linkText) => {
    const trimmedLink = linkText.trim();
    return `<span class="wikilink text-blue-400 hover:text-blue-300 underline underline-offset-4 cursor-pointer font-medium" data-link="${trimmedLink}">[[${trimmedLink}]]</span>`;
  });

  // Hashtags: #tag -> <span class="hashtag text-emerald-400 hover:underline cursor-pointer" data-tag="tag">#tag</span>
  html = html.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)(?=\s|$)/g, (_match, tagName) => {
    const trimmedTag = tagName.toLowerCase();
    return ` <span class="hashtag text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-xs" data-tag="${trimmedTag}">#${trimmedTag}</span>`;
  });

  return html;
}

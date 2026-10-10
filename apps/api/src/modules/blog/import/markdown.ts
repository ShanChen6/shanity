/**
 * Escapes text so Markdown shows it as written: emphasis, links, code,
 * math ($) and HTML-ish brackets, plus what would start a block at the
 * beginning of a line (headings, lists).
 */
export function escapeMarkdown(text: string) {
  return text
    .replace(/([\\`*_[\]$<>~|])/g, '\\$1')
    .replace(/^(\s*)(#{1,6})(?=\s)/gm, (_, space: string, hashes: string) => `${space}\\${hashes}`)
    .replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])(?=\s)/gm, '$1$2\\$3');
}

/** A GFM table cell: one line, no column separators. */
export function escapeTableCell(markdown: string) {
  return markdown.replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim();
}

import type { ImportedDocument } from './types.js';

/**
 * A Markdown or plain-text file, as written. Its first "# Heading" (or, for
 * text, its first short line) becomes the title; YAML front matter is
 * dropped. Text must be UTF-8 (with or without BOM) or UTF-16 with a BOM.
 */
export function markdownFile(buffer: Buffer, plainText: boolean): ImportedDocument {
  let text = decode(buffer).replace(/\r\n?/g, '\n');
  const warnings: string[] = [];
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  let title: string | null = null;
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.trim());
  if (first !== -1) {
    const line = lines[first]!.trim();
    const heading = /^#\s+(.+?)\s*#*$/.exec(line);
    if (heading) title = heading[1]!;
    else if (plainText && line.length <= 150 && lines[first + 1]?.trim() === '') title = line;
    if (title) lines.splice(first, 1);
  }
  return { title, markdown: lines.join('\n').trim() + '\n', warnings };
}

function decode(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  const start = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? 3 : 0;
  // Fails on non-UTF-8 bytes rather than showing mojibake.
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(start));
}

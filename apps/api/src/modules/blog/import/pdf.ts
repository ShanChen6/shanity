import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { ImportedDocument } from './types.js';

export const MAX_PDF_PAGES = 100;

/** The part of pdfjs-dist this reader uses. */
interface TextItem {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
}
interface PdfJs {
  getDocument(options: Record<string, unknown>): {
    destroy(): Promise<void>;
    promise: Promise<{
      numPages: number;
      getPage(number: number): Promise<{
        getTextContent(): Promise<{ items: Array<TextItem | { type: string }> }>;
      }>;
      getMetadata(): Promise<{ info?: { Title?: string } }>;
    }>;
  };
}

export class PdfUnavailableError extends Error {}

// Loaded by name so the API builds and runs without it; only PDF import
// needs it (pnpm --filter api add pdfjs-dist).
const PDFJS_MODULE = 'pdfjs-dist/legacy/build/pdf.mjs';
async function loadPdfJs(): Promise<{ pdfjs: PdfJs; assets: string | null }> {
  let pdfjs: PdfJs;
  try {
    pdfjs = (await import(PDFJS_MODULE)) as PdfJs;
  } catch (cause) {
    throw new PdfUnavailableError(`pdfjs-dist could not be loaded: ${String(cause)}`);
  }
  // Fonts PDFs name without embedding (Times, Helvetica…) and CJK CMaps
  // ship with the package; without them some text comes out empty.
  let assets: string | null = null;
  try {
    assets = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  } catch {
    assets = null;
  }
  return { pdfjs, assets };
}

type Line = { text: string; size: number; y: number; gapAbove: number };

/**
 * The text of a PDF as Markdown paragraphs. PDF keeps positioned glyphs, not
 * structure, so this is a best effort: lines are rebuilt from positions,
 * paragraphs from vertical gaps, headings from larger type, bullets from
 * their marks. Images, tables and formulas do not survive (the author is
 * told); scanned PDFs have no text at all.
 */
export async function pdfToMarkdown(buffer: Buffer): Promise<ImportedDocument> {
  const { pdfjs, assets } = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
    ...(assets
      ? {
          standardFontDataUrl: join(assets, 'standard_fonts') + '/',
          cMapUrl: join(assets, 'cmaps') + '/',
          cMapPacked: true,
        }
      : {}),
  });
  const document = await task.promise;
  const warnings = new Set<string>([
    'PDF chỉ giữ được chữ: ảnh, bảng và công thức cần chèn lại, định dạng có thể lệch.',
  ]);
  try {
    const pages = Math.min(document.numPages, MAX_PDF_PAGES);
    if (document.numPages > MAX_PDF_PAGES)
      warnings.add(`Chỉ nhập ${MAX_PDF_PAGES} trang đầu.`);
    const lines: Line[] = [];
    for (let number = 1; number <= pages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      lines.push(...pageLines(content.items.filter((item): item is TextItem => 'str' in item), number > 1));
    }
    if (!lines.some((line) => line.text.trim()))
      throw new Error('No text');
    let title: string | null = null;
    try {
      title = (await document.getMetadata()).info?.Title?.trim() || null;
    } catch {
      title = null;
    }
    title = usefulTitle(title);
    let markdown = linesToMarkdown(lines);
    // No usable metadata title: the opening heading is the title.
    const opening = /^#{2,3} (.+)\n/.exec(markdown);
    if (!title && opening) {
      title = opening[1]!.replace(/\\(.)/g, '$1');
      markdown = markdown.slice(opening[0].length).replace(/^\n+/, '');
    }
    return { title, markdown, warnings: [...warnings] };
  } finally {
    // Never let cleanup hide the result (or the real error).
    await Promise.resolve()
      .then(() => task.destroy())
      .catch(() => undefined);
  }
}

/** Glyph runs on one page, merged into lines top to bottom. */
function pageLines(items: TextItem[], newPage: boolean): Line[] {
  const lines: Array<Line & { parts: Array<{ x: number; text: string }> }> = [];
  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5] ?? 0;
    const x = item.transform[4] ?? 0;
    const size = Math.abs(item.height || item.transform[3] || 0);
    const current = lines.find((line) => Math.abs(line.y - y) <= Math.max(size, line.size) * 0.5);
    if (current) {
      current.parts.push({ x, text: item.str });
      current.size = Math.max(current.size, size);
    } else lines.push({ text: '', size, y, gapAbove: 0, parts: [{ x, text: item.str }] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((line, index) => ({
    text: line.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
    size: line.size,
    y: line.y,
    // A new page always starts a new paragraph.
    gapAbove: index === 0 ? (newPage ? Infinity : 0) : lines[index - 1]!.y - line.y,
  }));
}

/** Metadata titles tools fill in by themselves are not titles. */
function usefulTitle(title: string | null) {
  const cleaned = (title ?? '')
    .replace(/^Microsoft (Word|PowerPoint) - /i, '')
    .replace(/\.(docx?|pptx?|pdf|odt)$/i, '')
    .trim();
  return !cleaned || /^(untitled|không có tiêu đề|document\d*|presentation\d*)$/i.test(cleaned)
    ? null
    : cleaned;
}

const BULLET = /^[•●○◦▪■·\-–—*]\s+/;
const NUMBERED = /^(\d{1,3}|[a-zA-Z])[.)]\s+/;

function linesToMarkdown(lines: Line[]): string {
  const sizes = lines.filter((line) => line.text).map((line) => line.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  const blocks: string[] = [];
  let paragraph = '';
  const flush = () => {
    if (paragraph.trim()) blocks.push(paragraph.trim());
    paragraph = '';
  };
  for (const line of lines) {
    if (!line.text) continue;
    const text = escapePdfText(line.text);
    const heading = line.size >= body * 1.25 && line.text.length <= 120;
    const listItem = BULLET.test(line.text) || NUMBERED.test(line.text);
    const breakBefore = line.gapAbove > Math.max(line.size, body) * 1.6;
    if (heading) {
      flush();
      const level = line.size >= body * 1.6 ? 2 : 3;
      // Consecutive heading lines of one size are one wrapped heading.
      const last = blocks[blocks.length - 1];
      if (last?.startsWith('#'.repeat(level) + ' ') && !breakBefore)
        blocks[blocks.length - 1] = `${last} ${text}`;
      else blocks.push(`${'#'.repeat(level)} ${text}`);
      continue;
    }
    if (listItem) {
      flush();
      const bulleted = BULLET.test(line.text);
      paragraph = `${bulleted ? '- ' : '1. '}${escapePdfText(line.text.replace(bulleted ? BULLET : NUMBERED, ''))}`;
      continue;
    }
    if (breakBefore) flush();
    // Words split at a line end ("học-\nsinh") join back.
    paragraph = paragraph.endsWith('-') && /^\p{Ll}/u.test(line.text)
      ? paragraph.slice(0, -1) + text
      : paragraph ? `${paragraph} ${text}` : text;
  }
  flush();
  return joinBlocks(blocks);
}

function joinBlocks(blocks: string[]) {
  let out = '';
  for (const [index, block] of blocks.entries()) {
    const list = (value?: string) => /^(- |1\. )/.test(value ?? '');
    out += index === 0 ? '' : list(block) && list(blocks[index - 1]) ? '\n' : '\n\n';
    out += block;
  }
  return `${out}\n`;
}

function escapePdfText(text: string) {
  return text.replace(/([\\`*_[\]$<>~|])/g, '\\$1').replace(/^(#{1,6})(?=\s)/, '\\$1');
}

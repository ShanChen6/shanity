import { posix } from 'node:path';
import { ommlToLatex } from './omml.js';
import {
  child,
  descendants,
  elements,
  parseXml,
  textContent,
  type XmlElement,
} from './xml.js';
import type { ImportedDocument, SaveImage } from './types.js';
import { escapeMarkdown, escapeTableCell } from './markdown.js';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

type StyleInfo = { name: string; numId?: string; level?: string };

type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  /** Already Markdown (links, math, images): never escaped or styled again. */
  raw?: boolean;
};

interface Context {
  files: Map<string, Buffer>;
  rels: Map<string, { target: string; external: boolean }>;
  styles: Map<string, StyleInfo>;
  numbering: Map<string, Map<string, string>>;
  saveImage: SaveImage;
  warnings: Set<string>;
  images: number;
  maxImages: number;
}

/**
 * A Word document (.docx) as Markdown: headings, paragraphs, bold/italic,
 * bullet and numbered lists, tables, links, images (uploaded through
 * `saveImage`) and equations (OMML -> LaTeX for KaTeX). Layout that
 * Markdown cannot express (fonts, colours, columns, text boxes) is dropped;
 * the text is kept.
 */
export async function docxToMarkdown(
  files: Map<string, Buffer>,
  saveImage: SaveImage,
  maxImages: number,
): Promise<ImportedDocument> {
  const read = (name: string) => files.get(name)?.toString('utf8');
  const document = read('word/document.xml');
  if (!document) throw new Error('Missing word/document.xml');
  const context: Context = {
    files,
    rels: readRels(read('word/_rels/document.xml.rels')),
    styles: readStyles(read('word/styles.xml')),
    numbering: readNumbering(read('word/numbering.xml')),
    saveImage,
    warnings: new Set(),
    images: 0,
    maxImages,
  };
  const body = child(parseXml(document), 'w:body');
  if (!body) throw new Error('Missing w:body');

  let title: string | null = null;
  const blocks: string[] = [];
  for (const block of flatten(body)) {
    if (block.name === 'w:tbl') {
      const table = await convertTable(block, context);
      if (table) blocks.push(table);
      continue;
    }
    const paragraph = await convertParagraph(block, context);
    if (!paragraph) continue;
    if (paragraph.kind === 'title' && !title) {
      title = paragraph.text;
      continue;
    }
    blocks.push(paragraph.markdown);
  }
  if (!title) title = coreTitle(read('docProps/core.xml'));
  return {
    title,
    markdown: joinBlocks(blocks),
    warnings: [...context.warnings],
  };
}

/** Body-level paragraphs and tables, looking through content controls. */
function flatten(node: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const item of elements(node)) {
    if (item.name === 'w:p' || item.name === 'w:tbl') out.push(item);
    else if (item.name === 'w:sdt') {
      const content = child(item, 'w:sdtContent');
      if (content) out.push(...flatten(content));
    } else if (item.name === 'w:customXml' || item.name === 'w:ins')
      out.push(...flatten(item));
  }
  return out;
}

/** Lists and quotes keep their lines together; everything else is a paragraph. */
function joinBlocks(blocks: string[]) {
  let out = '';
  let previous = '';
  for (const block of blocks) {
    const listy = (line: string) => /^\s*([-*]|\d+\.) /.test(line);
    const quote = (line: string) => line.startsWith('> ');
    const together =
      (listy(block) && listy(previous)) || (quote(block) && quote(previous));
    out += out ? (together ? '\n' : '\n\n') : '';
    out += block;
    previous = block;
  }
  return out.trim() + '\n';
}

type Paragraph =
  | { kind: 'title'; text: string; markdown: string }
  | { kind: 'block'; markdown: string };

async function convertParagraph(
  paragraph: XmlElement,
  context: Context,
): Promise<Paragraph | null> {
  const props = child(paragraph, 'w:pPr');
  const styleId = child(props, 'w:pStyle')?.attrs['w:val'] ?? '';
  const styleInfo = context.styles.get(styleId);
  const style = (styleInfo?.name ?? styleId).toLowerCase();

  // An equation on a line of its own.
  const display = elements(paragraph, 'm:oMathPara');
  if (display.length && !hasText(paragraph, ['m:oMathPara', 'w:pPr'])) {
    const formulas = display
      .flatMap((para) => elements(para, 'm:oMath'))
      .map(ommlToLatex)
      .filter(Boolean);
    return formulas.length
      ? { kind: 'block', markdown: formulas.map((tex) => `$$\n${tex}\n$$`).join('\n\n') }
      : null;
  }

  const text = renderRuns(await collectRuns(paragraph, context)).trim();
  if (!text) return null;

  if (style === 'title') return { kind: 'title', text: plain(text), markdown: text };
  const outline = child(props, 'w:outlineLvl')?.attrs['w:val'];
  const heading = /^heading\s*(\d)/.exec(style)?.[1] ?? (outline ? String(Number(outline) + 1) : null);
  if (heading && Number(heading) <= 9) {
    const level = Math.min(Number(heading) + 1, 4);
    return { kind: 'block', markdown: `${'#'.repeat(level)} ${text.replace(/\n+/g, ' ')}` };
  }
  if (style === 'subtitle') return { kind: 'block', markdown: `*${plain(text)}*` };

  // Numbering on the paragraph, else from its style (List Bullet, List Number).
  const numbering = child(props, 'w:numPr');
  const numId = child(numbering, 'w:numId')?.attrs['w:val'] ?? styleInfo?.numId;
  const namedList = /^list (bullet|number)/.exec(style)?.[1];
  if ((numId && numId !== '0') || namedList) {
    const level = Number(child(numbering, 'w:ilvl')?.attrs['w:val'] ?? styleInfo?.level ?? 0);
    const format =
      (numId ? context.numbering.get(numId)?.get(String(level)) : undefined) ??
      (namedList === 'number' ? 'decimal' : 'bullet');
    const marker = format === 'bullet' || format === 'none' ? '-' : '1.';
    return {
      kind: 'block',
      markdown: `${'   '.repeat(Math.min(level, 4))}${marker} ${text.replace(/\n+/g, ' ')}`,
    };
  }
  if (/quote/.test(style))
    return { kind: 'block', markdown: text.split('\n').map((line) => `> ${line}`).join('\n') };
  return { kind: 'block', markdown: text };
}

/** Whether a paragraph holds text outside the given children. */
function hasText(paragraph: XmlElement, except: string[]) {
  return elements(paragraph).some(
    (item) => !except.includes(item.name) && textContent(item).trim() !== '',
  );
}

const plain = (markdown: string) => markdown.replace(/\\([\\*_[\]`$#>|~-])/g, '$1').replace(/[*_]/g, '');

async function collectRuns(node: XmlElement, context: Context): Promise<Run[]> {
  const runs: Run[] = [];
  for (const item of elements(node)) {
    switch (item.name) {
      case 'w:r':
        runs.push(...(await convertRun(item, context)));
        break;
      case 'w:hyperlink': {
        const inner = renderRuns(await collectRuns(item, context)).trim();
        const id = item.attrs['r:id'];
        const target = id ? context.rels.get(id) : undefined;
        const href = target?.external ? safeHref(target.target) : null;
        if (!inner) break;
        runs.push(href ? { text: `[${inner}](${href})`, raw: true } : { text: inner, raw: true });
        break;
      }
      case 'm:oMath': {
        const tex = ommlToLatex(item);
        if (tex) runs.push({ text: `$${tex}$`, raw: true });
        break;
      }
      case 'm:oMathPara':
        for (const math of elements(item, 'm:oMath')) {
          const tex = ommlToLatex(math);
          if (tex) runs.push({ text: `$${tex}$`, raw: true });
        }
        break;
      case 'w:ins':
      case 'w:smartTag':
      case 'w:fldSimple':
      case 'w:customXml':
      case 'w:sdt':
      case 'w:sdtContent':
        runs.push(...(await collectRuns(item, context)));
        break;
      default:
        break; // w:pPr, w:del, bookmarks, comments: nothing to show.
    }
  }
  return runs;
}

async function convertRun(run: XmlElement, context: Context): Promise<Run[]> {
  const props = child(run, 'w:rPr');
  const on = (name: string) => {
    const flag = child(props, name);
    return Boolean(flag) && !['0', 'false', 'off'].includes(flag!.attrs['w:val'] ?? '');
  };
  const vertical = child(props, 'w:vertAlign')?.attrs['w:val'];
  const style = { bold: on('w:b'), italic: on('w:i'), strike: on('w:strike') };
  const out: Run[] = [];
  for (const item of elements(run)) {
    switch (item.name) {
      case 'w:t': {
        const text = item.children.join('');
        if (vertical === 'superscript' || vertical === 'subscript') {
          // Markdown has no sup/sub; KaTeX draws it after the text (m², H₂O).
          const mark = vertical === 'superscript' ? '^' : '_';
          out.push({ text: `$${mark}{\\text{${text.replace(/[{}\\$]/g, '')}}}$`, raw: true });
        } else out.push({ text, ...style });
        break;
      }
      case 'w:tab':
        out.push({ text: ' ' });
        break;
      case 'w:br':
      case 'w:cr':
        if (item.attrs['w:type'] !== 'page') out.push({ text: '\n', raw: true });
        break;
      case 'w:noBreakHyphen':
        out.push({ text: '-' });
        break;
      case 'w:sym': {
        const code = parseInt(item.attrs['w:char'] ?? '', 16);
        // Symbol-font code points (F0xx) map to their Unicode look-alikes poorly; keep the plain ones.
        if (Number.isFinite(code) && code < 0xf000) out.push({ text: String.fromCodePoint(code), ...style });
        else context.warnings.add('Một số ký hiệu dùng font Symbol/Wingdings không chuyển được.');
        break;
      }
      case 'w:drawing':
      case 'w:pict':
      case 'mc:AlternateContent': {
        const image = await convertImage(item, context);
        if (image) out.push({ text: image, raw: true });
        break;
      }
      case 'w:object':
        context.warnings.add('Có đối tượng nhúng (công thức Equation 3.0/MathType cũ, biểu đồ…) không chuyển được; hãy chèn lại bằng ảnh hoặc công thức.');
        break;
      default:
        break;
    }
  }
  return out;
}

async function convertImage(node: XmlElement, context: Context): Promise<string | null> {
  // Word writes a modern drawing and a legacy fallback; take the first.
  const choice = node.name === 'mc:AlternateContent' ? child(node, 'mc:Choice') ?? node : node;
  const blip = descendants(choice, 'a:blip')[0];
  const legacy = descendants(choice, 'v:imagedata')[0];
  const id = blip?.attrs['r:embed'] ?? legacy?.attrs['r:id'];
  if (!id) {
    if (descendants(choice, 'wps:txbx').length || descendants(choice, 'v:textbox').length)
      context.warnings.add('Nội dung trong hộp văn bản (text box) không được chuyển; hãy chép tay nếu cần.');
    return null;
  }
  const target = context.rels.get(id);
  if (!target || target.external) return null;
  const path = posix.normalize(posix.join('word', target.target)).replace(/^\/+/, '');
  const extension = posix.extname(path).toLowerCase();
  const type = IMAGE_TYPES[extension];
  const data = context.files.get(path);
  if (!type || !data) {
    context.warnings.add(`Bỏ qua ảnh định dạng ${extension.replace('.', '').toUpperCase() || 'không rõ'} (chỉ hỗ trợ PNG, JPEG, GIF, WebP).`);
    return null;
  }
  if (context.images >= context.maxImages) {
    context.warnings.add(`Chỉ nhập tối đa ${context.maxImages} ảnh; các ảnh sau bị bỏ qua.`);
    return null;
  }
  context.images += 1;
  const saved = await context.saveImage(data, type);
  if (!saved) {
    context.warnings.add('Có ảnh không đọc được hoặc quá lớn nên bị bỏ qua.');
    return null;
  }
  const properties = descendants(node, 'wp:docPr')[0];
  const alt = (properties?.attrs.descr || properties?.attrs.title || '')
    .replace(/[[\]\n]/g, ' ')
    .trim();
  return `\n\n![${alt}](${saved})\n\n`;
}

async function convertTable(table: XmlElement, context: Context): Promise<string | null> {
  const rows: string[][] = [];
  for (const row of elements(table, 'w:tr')) {
    const cells: string[] = [];
    for (const cell of elements(row, 'w:tc')) {
      const parts: string[] = [];
      for (const block of flatten(cell)) {
        if (block.name === 'w:tbl') {
          context.warnings.add('Bảng lồng trong bảng được gộp thành chữ.');
          parts.push(plain(textContent(block)));
          continue;
        }
        const text = renderRuns(await collectRuns(block, context)).replace(/\n{2,}/g, ' ').trim();
        if (text) parts.push(text);
      }
      cells.push(escapeTableCell(parts.join(' ')));
      const span = Number(child(child(cell, 'w:tcPr'), 'w:gridSpan')?.attrs['w:val'] ?? 1);
      for (let index = 1; index < Math.min(span, 20); index++) cells.push('');
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return null;
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`;
  return [line(rows[0]!), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

/** Joins runs, merging neighbours with the same emphasis into one span. */
export function renderRuns(runs: Run[]): string {
  let out = '';
  let index = 0;
  while (index < runs.length) {
    const run = runs[index]!;
    if (run.raw) {
      out += run.text;
      index++;
      continue;
    }
    let text = run.text;
    let next = index + 1;
    while (
      next < runs.length &&
      !runs[next]!.raw &&
      Boolean(runs[next]!.bold) === Boolean(run.bold) &&
      Boolean(runs[next]!.italic) === Boolean(run.italic) &&
      Boolean(runs[next]!.strike) === Boolean(run.strike)
    )
      text += runs[next++]!.text;
    out += emphasize(escapeMarkdown(text), run);
    index = next;
  }
  return out;
}

/** `**x**` around the words only: Markdown ignores `** x **`. */
function emphasize(text: string, run: Run) {
  const mark = `${run.bold ? '**' : ''}${run.italic ? '*' : ''}${run.strike ? '~~' : ''}`;
  if (!mark || !text.trim()) return text;
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  const close = [...mark].reverse().join('');
  return `${lead}${mark}${text.trim()}${close}${trail}`;
}

function safeHref(target: string) {
  try {
    const url = new URL(target);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
      ? url.toString().replace(/[()]/g, encodeURIComponent)
      : null;
  } catch {
    return null;
  }
}

function readRels(xml?: string) {
  const rels = new Map<string, { target: string; external: boolean }>();
  if (!xml) return rels;
  for (const rel of descendants(parseXml(xml), 'Relationship'))
    if (rel.attrs.Id && rel.attrs.Target)
      rels.set(rel.attrs.Id, {
        target: rel.attrs.Target,
        external: rel.attrs.TargetMode === 'External',
      });
  return rels;
}

function readStyles(xml?: string) {
  const styles = new Map<string, StyleInfo>();
  if (!xml) return styles;
  for (const style of descendants(parseXml(xml), 'w:style')) {
    const id = style.attrs['w:styleId'];
    const name = child(style, 'w:name')?.attrs['w:val'];
    const numbering = child(child(style, 'w:pPr'), 'w:numPr');
    if (id && name)
      styles.set(id, {
        name,
        numId: child(numbering, 'w:numId')?.attrs['w:val'],
        level: child(numbering, 'w:ilvl')?.attrs['w:val'],
      });
  }
  return styles;
}

/** numId -> level -> numFmt ("bullet", "decimal", …). */
function readNumbering(xml?: string) {
  const result = new Map<string, Map<string, string>>();
  if (!xml) return result;
  const root = parseXml(xml);
  const abstract = new Map<string, Map<string, string>>();
  for (const definition of elements(root, 'w:abstractNum')) {
    const levels = new Map<string, string>();
    for (const level of elements(definition, 'w:lvl'))
      levels.set(level.attrs['w:ilvl'] ?? '0', child(level, 'w:numFmt')?.attrs['w:val'] ?? 'bullet');
    abstract.set(definition.attrs['w:abstractNumId'] ?? '', levels);
  }
  for (const number of elements(root, 'w:num')) {
    const abstractId = child(number, 'w:abstractNumId')?.attrs['w:val'];
    const levels = abstractId ? abstract.get(abstractId) : undefined;
    if (number.attrs['w:numId'] && levels) result.set(number.attrs['w:numId'], levels);
  }
  return result;
}

function coreTitle(xml?: string) {
  if (!xml) return null;
  try {
    const title = descendants(parseXml(xml), 'dc:title')[0];
    const text = title ? textContent(title).trim() : '';
    return text || null;
  } catch {
    return null;
  }
}

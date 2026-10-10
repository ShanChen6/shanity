import { describe, expect, it } from 'vitest';
import { docxToMarkdown } from './docx.js';
import { escapeMarkdown } from './markdown.js';
import { ommlToLatex } from './omml.js';
import { markdownFile } from './text.js';
import { parseXml } from './xml.js';
import { readZip, ZipError } from './zip.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const docx = (body: string, extra: Record<string, string> = {}) =>
  new Map<string, Buffer>(
    Object.entries({
      'word/document.xml': `<?xml version="1.0"?><w:document ${W} ${M} ${R}><w:body>${body}</w:body></w:document>`,
      ...extra,
    }).map(([name, xml]) => [name, Buffer.from(xml)]),
  );
const p = (inner: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const noImages = async () => null;

describe('docxToMarkdown', () => {
  it('keeps headings, emphasis, lists, tables and the title', async () => {
    const styles = `<w:styles ${W}>
      <w:style w:styleId="Title"><w:name w:val="Title"/></w:style>
      <w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
      <w:style w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>
    </w:styles>`;
    const result = await docxToMarkdown(
      docx(
        p(run('Hàm số bậc nhất'), 'Title') +
          p(run('Khái niệm'), 'Heading1') +
          p(run('Đây là ') + run('đậm', '<w:b/>') + run(' và ') + run('nghiêng', '<w:i/>')) +
          p(run('Ý một'), 'ListBullet') +
          p(run('Ý hai'), 'ListBullet') +
          `<w:tbl><w:tr><w:tc>${p(run('x'))}</w:tc><w:tc>${p(run('y|z'))}</w:tc></w:tr>` +
          `<w:tr><w:tc>${p(run('1'))}</w:tc><w:tc>${p(run('2'))}</w:tc></w:tr></w:tbl>`,
        { 'word/styles.xml': styles },
      ),
      noImages,
      10,
    );
    expect(result.title).toBe('Hàm số bậc nhất');
    expect(result.markdown).toBe(
      [
        '## Khái niệm',
        '',
        'Đây là **đậm** và *nghiêng*',
        '',
        '- Ý một',
        '- Ý hai',
        '',
        '| x | y\\|z |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
      ].join('\n'),
    );
  });

  it('turns Word equations into KaTeX, inline and on their own line', async () => {
    const fraction = `<m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f>`;
    const result = await docxToMarkdown(
      docx(
        p(run('Ta có ') + `<m:oMath>${fraction}</m:oMath>`) +
          `<w:p><m:oMathPara><m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:r><m:t>Δ</m:t></m:r></m:e></m:rad></m:oMath></m:oMathPara></w:p>`,
      ),
      noImages,
      10,
    );
    expect(result.markdown).toBe('Ta có $\\frac{a}{b}$\n\n$$\n\\sqrt{\\Delta}\n$$\n');
  });

  it('uploads images and points the draft at them', async () => {
    const saved: string[] = [];
    const result = await docxToMarkdown(
      docx(
        p(`<w:r><w:drawing><wp:inline xmlns:wp="wp"><wp:docPr descr="Đồ thị"/><a:graphic xmlns:a="a"><a:blip r:embed="rId5"/></a:graphic></wp:inline></w:drawing></w:r>`) +
          p(`<w:r><w:drawing><a:blip xmlns:a="a" r:embed="rId6"/></w:drawing></w:r>`),
        {
          'word/_rels/document.xml.rels': `<Relationships><Relationship Id="rId5" Target="media/image1.png"/><Relationship Id="rId6" Target="media/image2.emf"/></Relationships>`,
          'word/media/image1.png': 'png-bytes',
          'word/media/image2.emf': 'emf-bytes',
        },
      ),
      async (data, type) => {
        saved.push(`${type}:${data.toString()}`);
        return '/blog-images/0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21';
      },
      10,
    );
    expect(saved).toEqual(['image/png:png-bytes']);
    expect(result.markdown).toBe('![Đồ thị](/blog-images/0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21)\n');
    expect(result.warnings.join(' ')).toMatch(/EMF/);
  });
});

describe('ommlToLatex', () => {
  const math = (inner: string) => ommlToLatex(parseXml(`<m:oMath ${M}>${inner}</m:oMath>`));
  it('writes powers, sums, systems and vectors', () => {
    expect(
      math(`<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>`),
    ).toBe('{x}^{2}');
    expect(
      math(`<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>i</m:t></m:r></m:e></m:nary>`),
    ).toBe('\\sum_{i=1}^{n} i');
    expect(
      math(`<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e><m:r><m:t>F</m:t></m:r></m:e></m:acc>`),
    ).toBe('\\vec{F}');
    expect(math(`<m:r><m:t>a ≤ b → c</m:t></m:r>`)).toBe('a\\ \\le \\ b\\ \\rightarrow \\ c');
  });
});

describe('markdownFile', () => {
  it('takes the first heading as the title and drops front matter', () => {
    const result = markdownFile(Buffer.from('---\na: 1\n---\n# Tiêu đề\n\nNội dung $x^2$'), false);
    expect(result).toMatchObject({ title: 'Tiêu đề', markdown: 'Nội dung $x^2$\n' });
  });

  it('refuses text that is not UTF-8', () => {
    expect(() => markdownFile(Buffer.from([0x48, 0xe0, 0x4e]), true)).toThrow();
  });
});

describe('escapeMarkdown', () => {
  it('shows Markdown characters literally', () => {
    expect(escapeMarkdown('5$ * 3_x [a]')).toBe('5\\$ \\* 3\\_x \\[a\\]');
    expect(escapeMarkdown('# không\n1. hai\n- ba')).toBe('\\# không\n1\\. hai\n\\- ba');
  });
});

describe('readZip', () => {
  /** A one-entry ZIP, stored (no compression). */
  function zip(name: string, content: Buffer) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    const localPart = Buffer.concat([local, nameBytes, content]);
    const centralPart = Buffer.concat([central, nameBytes]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(centralPart.length, 12);
    end.writeUInt32LE(localPart.length, 16);
    return Buffer.concat([localPart, centralPart, end]);
  }

  it('reads entries and enforces the size cap', () => {
    const archive = zip('word/document.xml', Buffer.from('<x/>'));
    expect(readZip(archive, { maxTotalBytes: 100, maxEntries: 10 }).get('word/document.xml')?.toString()).toBe('<x/>');
    expect(() => readZip(archive, { maxTotalBytes: 2, maxEntries: 10 })).toThrow(ZipError);
    expect(() => readZip(Buffer.from('not a zip at all, just text'), { maxTotalBytes: 100, maxEntries: 10 })).toThrow(ZipError);
  });
});

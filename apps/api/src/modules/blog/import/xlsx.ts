import ExcelJS from 'exceljs';
import { escapeMarkdown, escapeTableCell } from './markdown.js';
import type { ImportedDocument } from './types.js';

export const MAX_SHEET_ROWS = 300;
export const MAX_SHEET_COLUMNS = 30;

/**
 * An Excel workbook as Markdown tables: one section per visible sheet, the
 * first non-empty row as the header, cell values as Excel displays them.
 * Very large sheets are cut (and the author told).
 */
export async function xlsxToMarkdown(buffer: Buffer): Promise<ImportedDocument> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const warnings = new Set<string>();
  const sections: string[] = [];
  const sheets = workbook.worksheets.filter((sheet) => sheet.state === 'visible');
  for (const sheet of sheets) {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_SHEET_ROWS) {
        warnings.add(`Mỗi trang tính chỉ nhập ${MAX_SHEET_ROWS} dòng đầu.`);
        return;
      }
      const cells: string[] = [];
      const count = Math.min(row.cellCount, MAX_SHEET_COLUMNS);
      if (row.cellCount > MAX_SHEET_COLUMNS)
        warnings.add(`Mỗi trang tính chỉ nhập ${MAX_SHEET_COLUMNS} cột đầu.`);
      for (let column = 1; column <= count; column++)
        cells.push(escapeTableCell(escapeMarkdown(cellText(row.getCell(column)))));
      if (cells.some(Boolean)) rows.push(cells);
    });
    if (!rows.length) continue;
    const width = Math.max(...rows.map((row) => row.length));
    // Trailing columns empty in every row are dropped.
    let used = width;
    while (used > 1 && rows.every((row) => !row[used - 1])) used--;
    const line = (cells: string[]) =>
      `| ${Array.from({ length: used }, (_, index) => cells[index] ?? '').join(' | ')} |`;
    const table = [
      line(rows[0]!),
      `| ${Array(used).fill('---').join(' | ')} |`,
      ...rows.slice(1).map(line),
    ].join('\n');
    sections.push(sheets.length > 1 ? `## ${escapeMarkdown(sheet.name)}\n\n${table}` : table);
  }
  if (!sections.length) throw new Error('Empty workbook');
  return { title: null, markdown: `${sections.join('\n\n')}\n`, warnings: [...warnings] };
}

function cellText(cell: ExcelJS.Cell): string {
  try {
    return (cell.text ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return String(cell.value ?? '').trim();
  }
}

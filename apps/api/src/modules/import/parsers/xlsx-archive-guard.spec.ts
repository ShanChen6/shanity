import {
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { zip } from '../../../../test/support/zip.js';
import {
  MAX_XLSX_ENTRIES,
  assertXlsxArchiveWithinLimits,
} from './xlsx-archive-guard.js';

const LIMIT = 1024 * 1024;
const zeros = (bytes: number) => Buffer.alloc(bytes);

describe('assertXlsxArchiveWithinLimits', () => {
  it('accepts a real workbook', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Quiz').addRow(['Question', 'Type']);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    expect(() => assertXlsxArchiveWithinLimits(buffer)).not.toThrow();
  });

  it('accepts archives up to the limit, deflated or stored', () => {
    expect(() =>
      assertXlsxArchiveWithinLimits(
        zip([
          { name: 'a.xml', data: zeros(LIMIT / 2) },
          { name: 'b.xml', data: zeros(LIMIT / 2), store: true },
        ]),
        LIMIT,
      ),
    ).not.toThrow();
  });

  it('refuses a highly compressed entry that expands past the limit', () => {
    const bomb = zip([
      { name: 'xl/sharedStrings.xml', data: zeros(LIMIT * 4) },
    ]);
    expect(bomb.length).toBeLessThan(LIMIT / 50);
    expect(() => assertXlsxArchiveWithinLimits(bomb, LIMIT)).toThrow(
      PayloadTooLargeException,
    );
  });

  it('measures real inflated bytes, not the declared sizes', () => {
    const liar = zip([
      {
        name: 'xl/sharedStrings.xml',
        data: zeros(LIMIT * 4),
        declaredSize: 10,
      },
    ]);
    expect(() => assertXlsxArchiveWithinLimits(liar, LIMIT)).toThrow(
      PayloadTooLargeException,
    );
  });

  it('adds up every entry, so many small ones cannot slip through', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `xl/part${index}.xml`,
      data: zeros(LIMIT / 4),
    }));
    expect(() => assertXlsxArchiveWithinLimits(zip(entries), LIMIT)).toThrow(
      PayloadTooLargeException,
    );
  });

  it('refuses too many entries', () => {
    const entries = Array.from(
      { length: MAX_XLSX_ENTRIES + 1 },
      (_, index) => ({
        name: `${index}`,
        data: Buffer.from('x'),
      }),
    );
    expect(() => assertXlsxArchiveWithinLimits(zip(entries))).toThrow(
      PayloadTooLargeException,
    );
  });

  it('answers 422 for archives it cannot read', () => {
    const valid = zip([{ name: 'a.xml', data: Buffer.from('<a/>') }]);
    const corrupt = Buffer.from(valid);
    corrupt.fill(0, 30, 40); // damage the compressed data
    for (const buffer of [Buffer.from('not a zip at all'), corrupt])
      expect(() => assertXlsxArchiveWithinLimits(buffer, LIMIT)).toThrow(
        UnprocessableEntityException,
      );
  });
});

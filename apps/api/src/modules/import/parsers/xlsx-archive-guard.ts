import { PayloadTooLargeException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { failImport } from '../import-errors.js';

// A real quiz sheet (1000 questions, 9 short columns) expands to a few MB;
// these leave ample headroom while capping what exceljs ever holds in memory.
export const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_XLSX_ENTRIES = 1000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const ZIP64_MARKER = 0xffffffff;

const tooLarge = () =>
  new PayloadTooLargeException({
    statusCode: 413,
    message: `The workbook expands beyond ${MAX_XLSX_UNCOMPRESSED_BYTES} bytes`,
    code: 'IMPORT_FILE_TOO_LARGE_UNCOMPRESSED',
  });
const unreadable = (): never =>
  failImport({}, 'The file is not a readable .xlsx workbook');

/**
 * Zip-bomb guard, run before exceljs unzips the workbook into memory. It walks
 * the ZIP central directory and actually inflates every entry with a hard
 * output cap, so the limit holds even when the archive lies about its sizes
 * or points several entries at the same compressed data. Encrypted, ZIP64
 * and non-deflate entries never occur in a normal .xlsx and are refused.
 */
export function assertXlsxArchiveWithinLimits(
  buffer: Buffer,
  limit = MAX_XLSX_UNCOMPRESSED_BYTES,
) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_XLSX_ENTRIES) throw tooLarge();
  if (directoryOffset + directorySize > eocd) unreadable();

  let total = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entries; index++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE
    )
      unreadable();
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const declaredSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    offset += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x1) unreadable(); // encrypted
    if (
      compressedSize === ZIP64_MARKER ||
      declaredSize === ZIP64_MARKER ||
      localOffset === ZIP64_MARKER
    )
      throw tooLarge();
    // Cheap early exit on honest sizes; the inflate below catches liars.
    if (total + declaredSize > limit) throw tooLarge();

    const data = entryData(buffer, localOffset, compressedSize);
    if (method === STORED) total += data.length;
    else if (method === DEFLATED) {
      try {
        total += inflateRawSync(data, {
          maxOutputLength: limit - total + 1,
        }).length;
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE')
          throw tooLarge();
        unreadable();
      }
    } else unreadable();
    if (total > limit) throw tooLarge();
  }
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const stop = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= stop; offset--)
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  return unreadable();
}

function entryData(buffer: Buffer, localOffset: number, size: number) {
  if (
    localOffset + 30 > buffer.length ||
    buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE
  )
    unreadable();
  const start =
    localOffset +
    30 +
    buffer.readUInt16LE(localOffset + 26) +
    buffer.readUInt16LE(localOffset + 28);
  if (start + size > buffer.length) unreadable();
  return buffer.subarray(start, start + size);
}

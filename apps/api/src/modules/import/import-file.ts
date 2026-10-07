import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { extname } from 'node:path';

export type ImportFormat = 'json' | 'markdown' | 'xlsx';

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Content files are small; anything larger is not a hand-authored import.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, ImportFormat> = {
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.xlsx': 'xlsx',
};

// Declared types accepted per format. Browsers and OSes disagree on Markdown
// (often text/plain), so the extension and the bytes decide together.
const MIME_TYPES: Record<ImportFormat, ReadonlySet<string>> = {
  json: new Set(['application/json']),
  markdown: new Set(['text/markdown', 'text/x-markdown', 'text/plain']),
  xlsx: new Set([XLSX_MIME_TYPE]),
};

const unsupported = (allowed: ImportFormat[]) =>
  new UnsupportedMediaTypeException({
    statusCode: 415,
    message: `Upload a ${allowed.map((format) => `.${format === 'markdown' ? 'md' : format}`).join(', ')} file`,
    code: 'UNSUPPORTED_IMPORT_FILE',
  });

/**
 * Picks the parser for an upload. Extension, declared MIME type and the bytes
 * themselves must all agree: an .xlsx must really be an OOXML spreadsheet,
 * and text formats must be NUL-free UTF-8 that file-type does not recognise
 * as some binary format.
 */
export async function detectImportFormat(
  file: Express.Multer.File | undefined,
  allowed: ImportFormat[],
): Promise<ImportFormat> {
  if (!file?.buffer?.length)
    throw new BadRequestException({
      statusCode: 400,
      message: 'A non-empty file is required',
      code: 'IMPORT_FILE_REQUIRED',
    });
  const format = EXTENSIONS[extname(file.originalname ?? '').toLowerCase()];
  const declared = (file.mimetype ?? '').split(';')[0]!.trim().toLowerCase();
  if (!format || !allowed.includes(format) || !MIME_TYPES[format].has(declared))
    throw unsupported(allowed);

  const detected = await fileTypeFromBuffer(file.buffer);
  if (format === 'xlsx') {
    if (detected?.mime !== XLSX_MIME_TYPE) throw unsupported(allowed);
  } else if (detected || !isUtf8Text(file.buffer)) throw unsupported(allowed);
  return format;
}

function isUtf8Text(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** UTF-8 text of a validated text upload, without a leading BOM. */
export const fileText = (buffer: Buffer) =>
  buffer.toString('utf8').replace(/^﻿/, '');

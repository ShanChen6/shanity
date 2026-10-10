import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {
  constructor(
    message: string,
    readonly tooLarge = false,
  ) {
    super(message);
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const ZIP64_MARKER = 0xffffffff;

export interface ZipLimits {
  /** Uncompressed bytes across every entry read. */
  maxTotalBytes: number;
  maxEntries: number;
}

/**
 * Reads the entries of a ZIP (a .docx) into memory, with the zip-bomb
 * guards of import/parsers/xlsx-archive-guard.ts: a hard cap on what is
 * inflated, whatever sizes the archive claims, and no encrypted or ZIP64
 * entries. `wanted` filters by name before anything is inflated.
 */
export function readZip(
  buffer: Buffer,
  limits: ZipLimits,
  wanted: (name: string) => boolean = () => true,
): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count > limits.maxEntries)
    throw new ZipError('Too many entries in the archive', true);
  if (directoryOffset + directorySize > eocd)
    throw new ZipError('Unreadable archive');

  const files = new Map<string, Buffer>();
  let total = 0;
  let offset = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE
    )
      throw new ZipError('Unreadable archive');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const declaredSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    if (!wanted(name) || name.endsWith('/')) continue;
    if (flags & 0x1) throw new ZipError('Encrypted archive');
    if (
      compressedSize === ZIP64_MARKER ||
      declaredSize === ZIP64_MARKER ||
      localOffset === ZIP64_MARKER
    )
      throw new ZipError('Archive too large', true);
    if (total + declaredSize > limits.maxTotalBytes)
      throw new ZipError('Archive expands too much', true);

    const data = entryData(buffer, localOffset, compressedSize);
    let content: Buffer;
    if (method === STORED) content = Buffer.from(data);
    else if (method === DEFLATED) {
      try {
        content = inflateRawSync(data, {
          maxOutputLength: limits.maxTotalBytes - total + 1,
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE')
          throw new ZipError('Archive expands too much', true);
        throw new ZipError('Unreadable archive');
      }
    } else throw new ZipError('Unsupported compression');
    total += content.length;
    if (total > limits.maxTotalBytes)
      throw new ZipError('Archive expands too much', true);
    files.set(name, content);
  }
  return files;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  if (buffer.length < EOCD_MIN_SIZE) throw new ZipError('Not an archive');
  const stop = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= stop; offset--)
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  throw new ZipError('Not an archive');
}

function entryData(buffer: Buffer, localOffset: number, size: number) {
  if (
    localOffset + 30 > buffer.length ||
    buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE
  )
    throw new ZipError('Unreadable archive');
  const start =
    localOffset +
    30 +
    buffer.readUInt16LE(localOffset + 26) +
    buffer.readUInt16LE(localOffset + 28);
  if (start + size > buffer.length) throw new ZipError('Unreadable archive');
  return buffer.subarray(start, start + size);
}

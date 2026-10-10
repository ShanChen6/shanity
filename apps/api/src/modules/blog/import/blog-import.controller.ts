import {
  BadRequestException,
  Controller,
  Header,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { fileTypeFromBuffer } from 'file-type';
import { extname } from 'node:path';
import { DataSource } from 'typeorm';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import { assertXlsxArchiveWithinLimits } from '../../import/parsers/xlsx-archive-guard.js';
import { normalizeBlogImage } from '../blog-images.controller.js';
import { BLOG_CONTENT_MAX } from '../blog.dto.js';
import { docxToMarkdown } from './docx.js';
import { markdownFile } from './text.js';
import { PdfUnavailableError, pdfToMarkdown } from './pdf.js';
import type { ImportedDocument } from './types.js';
import { xlsxToMarkdown } from './xlsx.js';
import { readZip, ZipError } from './zip.js';

export const MAX_BLOG_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORTED_IMAGES = 40;
const DOCX_MAX_UNCOMPRESSED = 150 * 1024 * 1024;

type Format = 'docx' | 'markdown' | 'text' | 'xlsx' | 'pdf';
const FORMATS: Record<string, Format> = {
  '.docx': 'docx',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.xlsx': 'xlsx',
  '.pdf': 'pdf',
};
/** What the bytes must be (file-type), per format; text has no signature. */
const SIGNATURES: Partial<Record<Format, string[]>> = {
  docx: ['docx', 'zip'],
  xlsx: ['xlsx', 'zip'],
  pdf: ['pdf'],
};

const error = (code: string, extra: object = {}) => ({ message: code, code, ...extra });

/**
 * Turns a document into a draft post body (Markdown) for the editor: Word,
 * Markdown, plain text, Excel (as tables) or PDF (text only). Nothing is
 * saved as a post; images found in a Word file are stored like uploads so
 * the draft can show them. The author reviews and edits before saving.
 */
@Controller('api/v1/blog/import')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class BlogImportController {
  private readonly logger = new Logger(BlogImportController.name);
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BLOG_IMPORT_BYTES, files: 1, fields: 0 },
    }),
  )
  async import(
    @Req() req: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException(error('BLOG_IMPORT_FILE_REQUIRED'));
    if (file.size > MAX_BLOG_IMPORT_BYTES)
      throw new PayloadTooLargeException(error('BLOG_IMPORT_TOO_LARGE'));
    const name = Buffer.from(file.originalname ?? '', 'latin1').toString('utf8');
    const format = FORMATS[extname(name).toLowerCase()];
    if (!format)
      throw new UnsupportedMediaTypeException(error('BLOG_IMPORT_UNSUPPORTED'));
    const expected = SIGNATURES[format];
    if (expected) {
      const detected = (await fileTypeFromBuffer(file.buffer))?.ext;
      if (!detected || !expected.includes(detected))
        throw new UnsupportedMediaTypeException(error('BLOG_IMPORT_UNSUPPORTED'));
    }

    let result: ImportedDocument;
    try {
      result = await this.convert(format, file.buffer, req.principal.id);
    } catch (cause) {
      if (cause instanceof HttpException) throw cause;
      if (cause instanceof PdfUnavailableError)
        throw new ServiceUnavailableException(error('BLOG_IMPORT_PDF_UNAVAILABLE'));
      if (cause instanceof ZipError && cause.tooLarge)
        throw new PayloadTooLargeException(error('BLOG_IMPORT_TOO_LARGE'));
      if (cause instanceof Error && cause.message === 'No text')
        throw new UnprocessableEntityException(error('BLOG_IMPORT_NO_TEXT'));
      this.logger.warn(`Blog import of a ${format} file failed: ${String(cause)}`);
      throw new UnprocessableEntityException(error('BLOG_IMPORT_UNREADABLE', { format }));
    }

    const warnings = [...result.warnings];
    let content = result.markdown.replace(/\n{3,}/g, '\n\n').trim();
    if (!content) throw new UnprocessableEntityException(error('BLOG_IMPORT_NO_TEXT'));
    if (content.length > BLOG_CONTENT_MAX) {
      content = content.slice(0, BLOG_CONTENT_MAX).replace(/\n[^\n]*$/, '');
      warnings.push('Tài liệu dài hơn giới hạn của một bài nên phần cuối đã bị cắt.');
    }
    const fallbackTitle = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    return {
      format,
      title: (result.title ?? fallbackTitle).slice(0, 200) || null,
      content: `${content}\n`,
      warnings,
    };
  }

  private async convert(format: Format, buffer: Buffer, uploaderId: string) {
    switch (format) {
      case 'markdown':
      case 'text':
        return markdownFile(buffer, format === 'text');
      case 'xlsx':
        assertXlsxArchiveWithinLimits(buffer);
        return xlsxToMarkdown(buffer);
      case 'pdf':
        return pdfToMarkdown(buffer);
      case 'docx': {
        const files = readZip(
          buffer,
          { maxTotalBytes: DOCX_MAX_UNCOMPRESSED, maxEntries: 5000 },
          (entry) =>
            entry.startsWith('word/') || entry === 'docProps/core.xml',
        );
        return docxToMarkdown(
          files,
          (data, mimetype) => this.saveImage(data, mimetype, uploaderId),
          MAX_IMPORTED_IMAGES,
        );
      }
    }
  }

  /** Stores an image of the document like an upload; null if it is not usable. */
  private async saveImage(data: Buffer, mimetype: string, uploaderId: string) {
    try {
      const image = await normalizeBlogImage({ buffer: data, mimetype, size: data.length });
      const [row] = await this.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO blog_images (uploader_id, data, width, height)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [uploaderId, image.data, image.width, image.height],
      );
      return `/blog-images/${row.id}`;
    } catch {
      return null;
    }
  }
}

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  LessonAccessGuard,
  type LessonAccessRequest,
} from './guards/lesson-access.guard.js';
import { DocumentAccessService } from './document-access.service.js';

@Controller('lessons')
@UseGuards(LessonAccessGuard)
export class DocumentAccessController {
  constructor(private readonly documents: DocumentAccessService) {}

  @Get(':id/document-view')
  view(
    @Req() request: LessonAccessRequest,
    @Res() response: Response,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.deliver(request, response, id, 'view');
  }

  @Get(':id/document-download')
  download(
    @Req() request: LessonAccessRequest,
    @Res() response: Response,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.deliver(request, response, id, 'download');
  }

  private async deliver(
    request: LessonAccessRequest,
    response: Response,
    lessonId: string,
    behavior: 'view' | 'download',
  ) {
    const document = await this.documents.open(
      lessonId,
      behavior,
      request.lessonAccess?.bypass === true,
    );
    response.set({
      'Content-Type': document.mimeType,
      'Content-Length': String(document.fileSize),
      'Content-Disposition': contentDisposition(behavior, document.fileName),
      'Content-Security-Policy':
        "default-src 'none'; script-src 'none'; object-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    document.stream.on('error', () => response.destroy());
    document.stream.pipe(response);
  }
}

function contentDisposition(
  behavior: 'view' | 'download',
  originalName: string,
) {
  const directive = behavior === 'view' ? 'inline' : 'attachment';
  const safe = originalName
    .replace(/[\r\n]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 180);
  return `${directive}; filename="${safe || 'document'}"; filename*=UTF-8''${encodeURIComponent(originalName.replace(/[\r\n]/g, ''))}`;
}

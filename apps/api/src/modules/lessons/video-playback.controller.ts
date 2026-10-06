import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LessonAccessGuard } from './guards/lesson-access.guard.js';
import { MediaUrlSigner } from '../../storage/media-url-signer.js';
import { VideoPlaybackService } from './video-playback.service.js';

@Controller('lessons')
@UseGuards(LessonAccessGuard)
export class VideoPlaybackController {
  constructor(private readonly playback: VideoPlaybackService) {}

  @Get(':id/video-access')
  @Header('Cache-Control', 'no-store')
  access(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.playback.createAccess(id);
  }
}

@Controller('lesson-media')
export class LocalVideoDeliveryController {
  constructor(
    private readonly signer: MediaUrlSigner,
    private readonly playback: VideoPlaybackService,
  ) {}

  @Get('*path')
  async stream(
    @Param('path') path: string | string[],
    @Query('expires') expiresValue: string | undefined,
    @Query('signature') signature: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const filePath = (Array.isArray(path) ? path : [path]).join('/');
    const expires = Number(expiresValue);
    if (!signature) throw new ForbiddenException('Invalid media signature');
    this.signer.verify(filePath, expires, signature);
    const media = await this.playback.storedVideo(filePath);
    const range = this.parseRange(request.headers.range, media.size);

    response.set({
      'Accept-Ranges': 'bytes',
      'Content-Type': media.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (range) {
      response.status(206).set({
        'Content-Range': `bytes ${range.start}-${range.end}/${media.size}`,
        'Content-Length': String(range.end - range.start + 1),
      });
    } else response.set('Content-Length', String(media.size));

    const stream = await this.playback.getStream(filePath, range);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  }

  private parseRange(value: string | undefined, size: number) {
    if (!value) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2]))
      throw new HttpException('Invalid video range', 416);
    let start: number;
    let end: number;
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isInteger(suffix) || suffix <= 0)
        throw new HttpException('Invalid video range', 416);
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size ||
      end >= size
    )
      throw new HttpException('Invalid video range', 416);
    return { start, end };
  }
}

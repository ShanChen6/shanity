import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Req,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';

export const MAX_BLOG_IMAGE_BYTES = 5 * 1024 * 1024;
/** Wide enough for a full-width article image on a retina screen. */
export const BLOG_IMAGE_MAX_WIDTH = 1600;
const FORMATS: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const error = (code: string) => ({ message: code, code });

/**
 * A static JPEG, PNG, WebP or GIF, re-encoded as WebP no wider than
 * BLOG_IMAGE_MAX_WIDTH (aspect kept, never enlarged, EXIF orientation
 * applied and metadata dropped). Re-encoding means only pixels are stored.
 */
export async function normalizeBlogImage(
  file?: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'size'>,
) {
  if (!file?.buffer?.length)
    throw new BadRequestException(error('BLOG_IMAGE_REQUIRED'));
  if (
    file.size > MAX_BLOG_IMAGE_BYTES ||
    file.buffer.length > MAX_BLOG_IMAGE_BYTES
  )
    throw new PayloadTooLargeException(error('BLOG_IMAGE_TOO_LARGE'));
  if (!Object.values(FORMATS).includes(file.mimetype))
    throw new UnsupportedMediaTypeException(error('BLOG_IMAGE_TYPE'));
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      FORMATS[metadata.format] !== file.mimetype ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Unsupported image');
    const { data, info } = await image
      .rotate()
      .resize({ width: BLOG_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new BadRequestException(error('BLOG_IMAGE_INVALID'));
  }
}

/** Uploads for post covers and inline images: authors and admins. */
@Controller('api/v1/blog/images')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class BlogImagesController {
  constructor(private readonly dataSource: DataSource) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BLOG_IMAGE_BYTES, files: 1, fields: 0 },
    }),
  )
  async upload(
    @Req() req: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const image = await normalizeBlogImage(file);
    const [row] = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO blog_images (uploader_id, data, width, height)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.principal.id, image.data, image.width, image.height],
    );
    return {
      id: row.id,
      /** Relative to the API origin. */
      path: `/blog-images/${row.id}`,
      width: image.width,
      height: image.height,
    };
  }
}

/** Public and immutable: an id always names the same pixels. */
@Controller('blog-images')
export class BlogImageFilesController {
  constructor(private readonly dataSource: DataSource) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async read(@Param('id', new ParseUUIDPipe()) id: string) {
    const [image] = await this.dataSource.query<Array<{ data: Buffer }>>(
      'SELECT data FROM blog_images WHERE id = $1',
      [id],
    );
    if (!image) throw new NotFoundException();
    return new StreamableFile(image.data, {
      type: 'image/webp',
      disposition: 'inline',
    });
  }
}

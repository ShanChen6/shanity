import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.module.js';
import { AuthService } from '../auth/auth.service.js';
import { AvatarStorage, AVATAR_KEY } from './avatar-storage.js';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const formats: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function normalizeAvatar(
  file?: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'size'>,
) {
  if (!file?.buffer?.length)
    throw new BadRequestException('An image is required');
  if (file.size > MAX_AVATAR_BYTES || file.buffer.length > MAX_AVATAR_BYTES)
    throw new PayloadTooLargeException();
  if (!Object.values(formats).includes(file.mimetype))
    throw new UnsupportedMediaTypeException();
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      formats[metadata.format] !== file.mimetype ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Unsupported image');
    return await image
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'Invalid image; use a static JPEG, PNG or WebP up to 16 megapixels',
    );
  }
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly storage: AvatarStorage,
  ) {}

  private async cleanup(key: string | null) {
    if (!key || !AVATAR_KEY.test(key)) return;
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn(
        'Avatar cleanup failed; reconcile unreferenced storage objects',
      );
    }
  }
  async upload(id: string, file?: Express.Multer.File) {
    const data = await normalizeAvatar(file);
    const key = `${randomUUID()}.webp`;
    await this.storage.put(key, data);
    return this.replace(id, key);
  }
  async remove(id: string) {
    return this.replace(id, null);
  }

  private async replace(id: string, key: string | null) {
    let result;
    try {
      result = await this.database.client.transaction(async (trx) => {
        // Serialize simultaneous replace/remove requests for this account.
        const user = await trx('users')
          .where({ id, status: 'active' })
          .forUpdate()
          .first('avatar_key');
        if (!user) throw new UnauthorizedException();
        await trx('users').where({ id }).update({ avatar_key: key });
        const profile = await this.auth.profile(id, trx);
        return { oldKey: user.avatar_key as string | null, profile };
      });
    } catch (error) {
      await this.cleanup(key);
      throw error;
    }
    // A cleanup failure must not roll back or hide a committed replacement.
    await this.cleanup(result.oldKey);
    return result.profile;
  }
}

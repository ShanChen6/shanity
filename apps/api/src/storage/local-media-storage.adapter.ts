import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { validateMediaFile } from './media-file-validator.js';
import type {
  MediaStorageDriver,
  MediaUploadMetadata,
  StorageFileResult,
} from './media-storage.types.js';
import { MediaUrlSigner } from './media-url-signer.js';

export interface LocalMediaStorageOptions {
  root: string;
  signingSecret: string;
  deliveryPath?: string;
}

export class LocalMediaStorageAdapter implements MediaStorageDriver {
  readonly provider = 'LOCAL' as const;
  private readonly root: string;
  private readonly deliveryPath: string;
  private readonly signer: MediaUrlSigner;

  constructor(private readonly options: LocalMediaStorageOptions) {
    this.root = resolve(options.root);
    this.deliveryPath = options.deliveryPath ?? '/lesson-media';
    this.signer = new MediaUrlSigner(options.signingSecret);
  }

  async upload(
    file: Express.Multer.File | Buffer,
    path: string,
    metadata?: MediaUploadMetadata,
  ): Promise<StorageFileResult> {
    const validated = await validateMediaFile(file, metadata);
    const destination = this.resolvePath(path);
    await mkdir(dirname(destination), { recursive: true });
    const handle = await open(destination, 'wx', 0o600);
    try {
      await handle.writeFile(validated.buffer);
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
    return {
      filePath: this.normalizeKey(path),
      size: validated.buffer.length,
      contentType: validated.contentType,
      checksumSha256: createHash('sha256')
        .update(validated.buffer)
        .digest('hex'),
      metadata: validated.metadata,
    };
  }

  async delete(filePath: string) {
    try {
      await unlink(this.resolvePath(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async getSignedUrl(filePath: string, expiresInSeconds: number) {
    const key = this.normalizeKey(filePath);
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 60 ||
      expiresInSeconds > 7200
    )
      throw new BadRequestException(
        'Media URL expiry must be between 60 and 7200 seconds',
      );
    await this.ensureExists(key);
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.signer.sign(key, expires);
    return `${this.deliveryPath}/${key.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=${signature}`;
  }

  async getStream(
    filePath: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const path = this.resolvePath(filePath);
    await this.ensureExists(filePath);
    return createReadStream(path, range);
  }

  private async ensureExists(filePath: string) {
    try {
      const info = await stat(this.resolvePath(filePath));
      if (!info.isFile()) throw new NotFoundException('Media file not found');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Media file not found');
      throw error;
    }
  }

  private normalizeKey(filePath: string) {
    if (
      !filePath ||
      filePath.includes('\\') ||
      filePath.startsWith('/') ||
      filePath.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new BadRequestException('Invalid media storage path');
    return filePath;
  }

  private resolvePath(filePath: string) {
    const key = this.normalizeKey(filePath);
    const candidate = resolve(join(this.root, key));
    const fromRoot = relative(this.root, candidate);
    if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..')
      throw new BadRequestException('Invalid media storage path');
    return candidate;
  }
}

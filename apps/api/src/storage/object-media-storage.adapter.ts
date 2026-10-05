import { ServiceUnavailableException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type {
  MediaStorageDriver,
  MediaUploadMetadata,
  StorageFileResult,
} from './media-storage.types.js';

/** Fail-closed seam for a future private S3/R2 implementation. */
export class ObjectMediaStorageAdapter implements MediaStorageDriver {
  readonly provider = 'S3' as const;
  private unavailable(): never {
    throw new ServiceUnavailableException(
      'Object media storage adapter is not configured',
    );
  }

  upload(
    _file: Express.Multer.File | Buffer,
    _path: string,
    _metadata?: MediaUploadMetadata,
  ): Promise<StorageFileResult> {
    return this.unavailable();
  }
  delete(_filePath: string): Promise<void> {
    return this.unavailable();
  }
  getSignedUrl(_filePath: string, _expiresInSeconds: number): Promise<string> {
    return this.unavailable();
  }
  getStream(
    _filePath: string,
    _range?: { start: number; end: number },
  ): Promise<Readable> {
    return this.unavailable();
  }
}

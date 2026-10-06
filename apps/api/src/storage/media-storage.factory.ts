import { Injectable } from '@nestjs/common';
import { LocalMediaStorageAdapter } from './local-media-storage.adapter.js';
import { ObjectMediaStorageAdapter } from './object-media-storage.adapter.js';
import type { MediaStorageDriver } from './media-storage.types.js';

type StorageEnvironment = NodeJS.ProcessEnv;

@Injectable()
export class MediaStorageFactory {
  create(environment: StorageEnvironment = process.env): MediaStorageDriver {
    const driver = environment.STORAGE_DRIVER ?? 'local';
    if (driver === 'local')
      return new LocalMediaStorageAdapter({
        root: environment.LESSON_MEDIA_STORAGE_DIR ?? 'uploads/lessons',
        signingSecret:
          environment.MEDIA_SIGNING_SECRET ?? environment.JWT_SECRET ?? '',
      });
    if (driver === 's3') return new ObjectMediaStorageAdapter();
    throw new Error('STORAGE_DRIVER must be local or s3');
  }
}

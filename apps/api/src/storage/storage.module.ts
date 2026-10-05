import { Module } from '@nestjs/common';
import { MEDIA_STORAGE_DRIVER } from './media-storage.constants.js';
import { MediaStorageFactory } from './media-storage.factory.js';
import { MediaUrlSigner } from './media-url-signer.js';

@Module({
  providers: [
    MediaStorageFactory,
    {
      provide: MediaUrlSigner,
      useFactory: () => new MediaUrlSigner(),
    },
    {
      provide: MEDIA_STORAGE_DRIVER,
      inject: [MediaStorageFactory],
      useFactory: (factory: MediaStorageFactory) => factory.create(),
    },
  ],
  exports: [MEDIA_STORAGE_DRIVER, MediaUrlSigner],
})
export class StorageModule {}

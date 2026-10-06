var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { MEDIA_STORAGE_DRIVER } from './media-storage.constants.js';
import { MediaStorageFactory } from './media-storage.factory.js';
import { MediaUrlSigner } from './media-url-signer.js';
let StorageModule = class StorageModule {
};
StorageModule = __decorate([
    Module({
        providers: [
            MediaStorageFactory,
            {
                provide: MediaUrlSigner,
                useFactory: () => new MediaUrlSigner(),
            },
            {
                provide: MEDIA_STORAGE_DRIVER,
                inject: [MediaStorageFactory],
                useFactory: (factory) => factory.create(),
            },
        ],
        exports: [MEDIA_STORAGE_DRIVER, MediaUrlSigner],
    })
], StorageModule);
export { StorageModule };
//# sourceMappingURL=storage.module.js.map
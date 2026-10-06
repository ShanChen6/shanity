var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { LocalMediaStorageAdapter } from './local-media-storage.adapter.js';
import { ObjectMediaStorageAdapter } from './object-media-storage.adapter.js';
let MediaStorageFactory = class MediaStorageFactory {
    create(environment = process.env) {
        const driver = environment.STORAGE_DRIVER ?? 'local';
        if (driver === 'local')
            return new LocalMediaStorageAdapter({
                root: environment.LESSON_MEDIA_STORAGE_DIR ?? 'uploads/lessons',
                signingSecret: environment.MEDIA_SIGNING_SECRET ?? environment.JWT_SECRET ?? '',
            });
        if (driver === 's3')
            return new ObjectMediaStorageAdapter();
        throw new Error('STORAGE_DRIVER must be local or s3');
    }
};
MediaStorageFactory = __decorate([
    Injectable()
], MediaStorageFactory);
export { MediaStorageFactory };
//# sourceMappingURL=media-storage.factory.js.map
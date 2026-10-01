var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AvatarService_1;
import { BadRequestException, Injectable, Logger, PayloadTooLargeException, UnauthorizedException, UnsupportedMediaTypeException, } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.module.js';
import { AuthService } from '../auth/auth.service.js';
import { AvatarStorage, AVATAR_KEY } from './avatar-storage.js';
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const formats = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};
export async function normalizeAvatar(file) {
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
        if (!metadata.format ||
            formats[metadata.format] !== file.mimetype ||
            (metadata.pages ?? 1) !== 1)
            throw new Error('Unsupported image');
        return await image
            .rotate()
            .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    }
    catch {
        throw new BadRequestException('Invalid image; use a static JPEG, PNG or WebP up to 16 megapixels');
    }
}
let AvatarService = AvatarService_1 = class AvatarService {
    database;
    auth;
    storage;
    logger = new Logger(AvatarService_1.name);
    constructor(database, auth, storage) {
        this.database = database;
        this.auth = auth;
        this.storage = storage;
    }
    async cleanup(key) {
        if (!key || !AVATAR_KEY.test(key))
            return;
        try {
            await this.storage.delete(key);
        }
        catch {
            this.logger.warn('Avatar cleanup failed; reconcile unreferenced storage objects');
        }
    }
    async upload(id, file) {
        const data = await normalizeAvatar(file);
        const key = `${randomUUID()}.webp`;
        await this.storage.put(key, data);
        return this.replace(id, key);
    }
    async remove(id) {
        return this.replace(id, null);
    }
    async replace(id, key) {
        let result;
        try {
            result = await this.database.client.transaction(async (trx) => {
                const user = await trx('users')
                    .where({ id, status: 'active' })
                    .forUpdate()
                    .first('avatar_key');
                if (!user)
                    throw new UnauthorizedException();
                await trx('users').where({ id }).update({ avatar_key: key });
                const profile = await this.auth.profile(id, trx);
                return { oldKey: user.avatar_key, profile };
            });
        }
        catch (error) {
            await this.cleanup(key);
            throw error;
        }
        await this.cleanup(result.oldKey);
        return result.profile;
    }
};
AvatarService = AvatarService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        AuthService,
        AvatarStorage])
], AvatarService);
export { AvatarService };
//# sourceMappingURL=avatar.service.js.map
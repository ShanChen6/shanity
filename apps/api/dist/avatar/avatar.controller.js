var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Controller, Delete, Get, Header, HttpCode, Param, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthRateGuard, OriginGuard, SessionGuard, } from '../auth/auth.guards.js';
import { AvatarService, MAX_AVATAR_BYTES } from './avatar.service.js';
import { AvatarStorage } from './avatar-storage.js';
let AvatarController = class AvatarController {
    avatars;
    constructor(avatars) {
        this.avatars = avatars;
    }
    uploadAvatar(req, file) {
        if (Object.keys(req.body ?? {}).length)
            throw new BadRequestException('Unexpected fields');
        return this.avatars.upload(req.principal.id, file);
    }
    removeAvatar(req) {
        if (Object.keys(req.body ?? {}).length)
            throw new BadRequestException('Unexpected fields');
        return this.avatars.remove(req.principal.id);
    }
};
__decorate([
    Post(),
    HttpCode(200),
    Header('Cache-Control', 'no-store'),
    UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0, parts: 2 },
    })),
    __param(0, Req()),
    __param(1, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AvatarController.prototype, "uploadAvatar", null);
__decorate([
    Delete(),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AvatarController.prototype, "removeAvatar", null);
AvatarController = __decorate([
    Controller('users/me/avatar'),
    UseGuards(OriginGuard, SessionGuard, AuthRateGuard),
    __metadata("design:paramtypes", [AvatarService])
], AvatarController);
export { AvatarController };
let AvatarFilesController = class AvatarFilesController {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async image(key) {
        return new StreamableFile(await this.storage.read(key), {
            type: 'image/webp',
            disposition: 'inline',
        });
    }
};
__decorate([
    Get(':key'),
    Header('Cache-Control', 'public, max-age=31536000, immutable'),
    Header('X-Content-Type-Options', 'nosniff'),
    __param(0, Param('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AvatarFilesController.prototype, "image", null);
AvatarFilesController = __decorate([
    Controller('avatars'),
    __metadata("design:paramtypes", [AvatarStorage])
], AvatarFilesController);
export { AvatarFilesController };
//# sourceMappingURL=avatar.controller.js.map
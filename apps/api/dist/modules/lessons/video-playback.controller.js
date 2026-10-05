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
import { Controller, ForbiddenException, Get, Header, HttpException, Param, ParseUUIDPipe, Query, Req, Res, UseGuards, } from '@nestjs/common';
import { LessonAccessGuard } from './guards/lesson-access.guard.js';
import { MediaUrlSigner } from '../../storage/media-url-signer.js';
import { VideoPlaybackService } from './video-playback.service.js';
let VideoPlaybackController = class VideoPlaybackController {
    playback;
    constructor(playback) {
        this.playback = playback;
    }
    access(id) {
        return this.playback.createAccess(id);
    }
};
__decorate([
    Get(':id/video-access'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VideoPlaybackController.prototype, "access", null);
VideoPlaybackController = __decorate([
    Controller('lessons'),
    UseGuards(LessonAccessGuard),
    __metadata("design:paramtypes", [VideoPlaybackService])
], VideoPlaybackController);
export { VideoPlaybackController };
let LocalVideoDeliveryController = class LocalVideoDeliveryController {
    signer;
    playback;
    constructor(signer, playback) {
        this.signer = signer;
        this.playback = playback;
    }
    async stream(path, expiresValue, signature, request, response) {
        const filePath = (Array.isArray(path) ? path : [path]).join('/');
        const expires = Number(expiresValue);
        if (!signature)
            throw new ForbiddenException('Invalid media signature');
        this.signer.verify(filePath, expires, signature);
        const media = await this.playback.storedVideo(filePath);
        const range = this.parseRange(request.headers.range, media.size);
        response.set({
            'Accept-Ranges': 'bytes',
            'Content-Type': media.contentType,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        if (range) {
            response.status(206).set({
                'Content-Range': `bytes ${range.start}-${range.end}/${media.size}`,
                'Content-Length': String(range.end - range.start + 1),
            });
        }
        else
            response.set('Content-Length', String(media.size));
        const stream = await this.playback.getStream(filePath, range);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    }
    parseRange(value, size) {
        if (!value)
            return undefined;
        const match = /^bytes=(\d*)-(\d*)$/.exec(value);
        if (!match || (!match[1] && !match[2]))
            throw new HttpException('Invalid video range', 416);
        let start;
        let end;
        if (!match[1]) {
            const suffix = Number(match[2]);
            if (!Number.isInteger(suffix) || suffix <= 0)
                throw new HttpException('Invalid video range', 416);
            start = Math.max(0, size - suffix);
            end = size - 1;
        }
        else {
            start = Number(match[1]);
            end = match[2] ? Number(match[2]) : size - 1;
        }
        if (!Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 0 ||
            end < start ||
            start >= size ||
            end >= size)
            throw new HttpException('Invalid video range', 416);
        return { start, end };
    }
};
__decorate([
    Get('*path'),
    __param(0, Param('path')),
    __param(1, Query('expires')),
    __param(2, Query('signature')),
    __param(3, Req()),
    __param(4, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], LocalVideoDeliveryController.prototype, "stream", null);
LocalVideoDeliveryController = __decorate([
    Controller('lesson-media'),
    __metadata("design:paramtypes", [MediaUrlSigner,
        VideoPlaybackService])
], LocalVideoDeliveryController);
export { LocalVideoDeliveryController };
//# sourceMappingURL=video-playback.controller.js.map
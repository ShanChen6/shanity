var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
let MediaUrlSigner = class MediaUrlSigner {
    secret;
    constructor(secret = process.env.MEDIA_SIGNING_SECRET ??
        process.env.JWT_SECRET ??
        '') {
        this.secret = secret;
        if (Buffer.byteLength(secret) < 32)
            throw new Error('MEDIA_SIGNING_SECRET must contain at least 32 bytes');
    }
    sign(filePath, expires) {
        return createHmac('sha256', this.secret)
            .update(`${filePath}:${expires}`)
            .digest('base64url');
    }
    verify(filePath, expires, signature) {
        if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000))
            throw new ForbiddenException('Media URL has expired');
        const expected = Buffer.from(this.sign(filePath, expires));
        const supplied = Buffer.from(signature);
        if (expected.length !== supplied.length ||
            !timingSafeEqual(expected, supplied))
            throw new ForbiddenException('Invalid media signature');
    }
};
MediaUrlSigner = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Object])
], MediaUrlSigner);
export { MediaUrlSigner };
//# sourceMappingURL=media-url-signer.js.map
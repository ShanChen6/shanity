var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import '../database/config.js';
import { Injectable } from '@nestjs/common';
let AuthConfig = class AuthConfig {
    secret;
    accessSeconds;
    refreshSeconds;
    origin;
    production = process.env.NODE_ENV === 'production';
    googleId = process.env.GOOGLE_CLIENT_ID ?? '';
    googleSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
    googleCallback = process.env.GOOGLE_CALLBACK_URL ?? '';
    constructor() {
        const secret = process.env.JWT_SECRET ?? '';
        if (Buffer.byteLength(secret) < 32 || secret.includes('replace-'))
            throw new Error('JWT_SECRET must contain at least 32 random bytes');
        this.secret = new TextEncoder().encode(secret);
        this.accessSeconds = this.duration('JWT_ACCESS_SECONDS', 60, 900);
        this.refreshSeconds = this.duration('AUTH_REFRESH_SECONDS', 600, 2592000);
        this.origin = this.url('WEB_ORIGIN', process.env.WEB_ORIGIN ?? '').origin;
        if (new URL(process.env.WEB_ORIGIN).href !== `${this.origin}/`)
            throw new Error('WEB_ORIGIN must be an origin without a path');
        const configured = [
            this.googleId,
            this.googleSecret,
            this.googleCallback,
        ].filter(Boolean).length;
        if (configured !== 0 && configured !== 3)
            throw new Error('Configure all GOOGLE_* values or leave all empty');
        if (configured) {
            const callback = this.url('GOOGLE_CALLBACK_URL', this.googleCallback);
            if (callback.pathname !== '/auth/google/callback')
                throw new Error('GOOGLE_CALLBACK_URL must target /auth/google/callback');
        }
    }
    duration(name, min, max) {
        const value = Number(process.env[name]);
        if (!Number.isInteger(value) || value < min || value > max)
            throw new Error(`${name} must be between ${min} and ${max}`);
        return value;
    }
    url(name, value) {
        let url;
        try {
            url = new URL(value);
        }
        catch {
            throw new Error(`${name} must be a valid URL`);
        }
        if (url.username ||
            url.password ||
            url.hash ||
            url.search ||
            (url.protocol !== 'https:' &&
                (this.production ||
                    url.protocol !== 'http:' ||
                    !['localhost', '127.0.0.1'].includes(url.hostname))))
            throw new Error(`${name} requires HTTPS (HTTP localhost allowed in development)`);
        return url;
    }
    cookieName(kind) {
        return `${this.production ? '__Host-' : ''}shanity_${kind}`;
    }
    cookieOptions(seconds) {
        return {
            httpOnly: true,
            secure: this.production,
            sameSite: 'lax',
            path: '/',
            maxAge: seconds * 1000,
        };
    }
};
AuthConfig = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [])
], AuthConfig);
export { AuthConfig };
//# sourceMappingURL=auth.config.js.map
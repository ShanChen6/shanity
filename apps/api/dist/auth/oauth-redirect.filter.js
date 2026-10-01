var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Catch, HttpException, Injectable, } from '@nestjs/common';
import { AuthConfig } from './auth.config.js';
let OAuthRedirectFilter = class OAuthRedirectFilter {
    config;
    constructor(config) {
        this.config = config;
    }
    catch(error, host) {
        const req = host.switchToHttp().getRequest();
        const res = host.switchToHttp().getResponse();
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const code = status === 409
            ? 'account_conflict'
            : status === 429
                ? 'rate_limited'
                : status === 503
                    ? 'unavailable'
                    : status === 401 && req.query.error === 'access_denied'
                        ? 'cancelled'
                        : 'failed';
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.clearCookie(this.config.cookieName('oauth'), this.config.cookieOptions(0));
        res.redirect(`${this.config.origin}/auth/callback?error=${code}`);
    }
};
OAuthRedirectFilter = __decorate([
    Injectable(),
    Catch(),
    __metadata("design:paramtypes", [AuthConfig])
], OAuthRedirectFilter);
export { OAuthRedirectFilter };
//# sourceMappingURL=oauth-redirect.filter.js.map
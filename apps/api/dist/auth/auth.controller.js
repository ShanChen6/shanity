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
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards, UseFilters, } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CreateUserDto, UpdateUserDto, ChangeUserRoleDto, ChangeUserStatusDto, ListUsersQueryDto, LoginDto, ProfileDto, RegisterDto, } from './auth.dto.js';
import { AuthRateGuard, cookie, OriginGuard, Roles, SessionGuard, } from './auth.guards.js';
import { OAuthRedirectFilter } from './oauth-redirect.filter.js';
import { GoogleService } from './google.service.js';
let AuthController = class AuthController {
    auth;
    google;
    constructor(auth, google) {
        this.auth = auth;
        this.google = google;
    }
    write(res, tokens) {
        const config = this.auth.config;
        res.cookie(config.cookieName('access'), tokens.access, config.cookieOptions(config.accessSeconds));
        res.cookie(config.cookieName('refresh'), tokens.refresh, config.cookieOptions(config.refreshSeconds));
        return { authenticated: true };
    }
    async register(dto, res) {
        return this.write(res, await this.auth.register(dto));
    }
    async login(dto, res) {
        return this.write(res, await this.auth.login(dto));
    }
    async refresh(req, res) {
        return this.write(res, await this.auth.refresh(cookie(req, this.auth.config.cookieName('refresh'))));
    }
    async logout(req, res) {
        await this.auth.logout(cookie(req, this.auth.config.cookieName('refresh')));
        for (const kind of ['access', 'refresh'])
            res.clearCookie(this.auth.config.cookieName(kind), this.auth.config.cookieOptions(0));
    }
    async googleLogin(res) {
        const flow = await this.google.start();
        res.setHeader('Cache-Control', 'no-store');
        res.cookie(this.auth.config.cookieName('oauth'), flow.browser, this.auth.config.cookieOptions(600));
        res.redirect(flow.url);
    }
    async googleLink(req, res) {
        const flow = await this.google.start(req.principal.sessionId);
        res.setHeader('Cache-Control', 'no-store');
        res.cookie(this.auth.config.cookieName('oauth'), flow.browser, this.auth.config.cookieOptions(600));
        return { url: flow.url };
    }
    async googleCallback(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        const browser = cookie(req, this.auth.config.cookieName('oauth'));
        res.clearCookie(this.auth.config.cookieName('oauth'), this.auth.config.cookieOptions(0));
        const result = await this.google.callback(req.query.state, browser, req.query.code, req.query.error, cookie(req, this.auth.config.cookieName('access')));
        if (!result.linked)
            this.write(res, result.tokens);
        res.redirect(`${this.auth.config.origin}/auth/callback?result=${result.linked ? 'linked' : 'signed_in'}`);
    }
};
__decorate([
    Post('register'),
    Header('Cache-Control', 'no-store'),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    Post('login'),
    HttpCode(200),
    Header('Cache-Control', 'no-store'),
    __param(0, Body()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    Post('refresh'),
    HttpCode(200),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    Post('logout'),
    HttpCode(204),
    __param(0, Req()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    Get('google'),
    UseFilters(OAuthRedirectFilter),
    __param(0, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleLogin", null);
__decorate([
    Post('google/link'),
    UseGuards(SessionGuard),
    HttpCode(200),
    __param(0, Req()),
    __param(1, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleLink", null);
__decorate([
    Get('google/callback'),
    UseFilters(OAuthRedirectFilter),
    __param(0, Req()),
    __param(1, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCallback", null);
AuthController = __decorate([
    Controller('auth'),
    UseGuards(OriginGuard, AuthRateGuard),
    __metadata("design:paramtypes", [AuthService,
        GoogleService])
], AuthController);
export { AuthController };
let UsersController = class UsersController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    list(query) {
        return this.auth.listUsers(query);
    }
    create(req, dto) {
        return this.auth.createUser(req.principal, dto);
    }
    me(req) {
        return this.auth.profile(req.principal.id);
    }
    async update(req, dto) {
        await this.auth.database
            .client('users')
            .where({ id: req.principal.id, status: 'active' })
            .update({ display_name: dto.displayName });
        return this.auth.profile(req.principal.id);
    }
    adminCheck() {
        return { authorized: true };
    }
    changeRole(req, id, dto) {
        return this.auth.changeUserRole(req.principal, id, dto.role);
    }
    changeStatus(req, id, dto) {
        return this.auth.changeUserStatus(req.principal, id, dto.status);
    }
    statistics() {
        return this.auth.userStatistics();
    }
    edit(req, id, dto) {
        return this.auth.updateUser(req.principal, id, dto);
    }
    detail(id) {
        return this.auth.userDetail(id);
    }
};
__decorate([
    Get(),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ListUsersQueryDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "list", null);
__decorate([
    Post(),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    Get('me'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "me", null);
__decorate([
    Patch('me'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ProfileDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    Get('admin-check'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "adminCheck", null);
__decorate([
    Patch(':id/role'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ChangeUserRoleDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "changeRole", null);
__decorate([
    Patch(':id/status'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ChangeUserStatusDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "changeStatus", null);
__decorate([
    Get('stats'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "statistics", null);
__decorate([
    Patch(':id'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UpdateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "edit", null);
__decorate([
    Get(':id'),
    Roles('admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "detail", null);
UsersController = __decorate([
    Controller('users'),
    UseGuards(OriginGuard, SessionGuard),
    __metadata("design:paramtypes", [AuthService])
], UsersController);
export { UsersController };
//# sourceMappingURL=auth.controller.js.map
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { AvatarController, AvatarFilesController, } from '../avatar/avatar.controller.js';
import { AvatarService } from '../avatar/avatar.service.js';
import { AvatarStorage, LocalAvatarStorage } from '../avatar/avatar-storage.js';
import { OAuthRedirectFilter } from './oauth-redirect.filter.js';
import { Module, ValidationPipe } from '@nestjs/common';
import { SafeErrorsFilter } from './safe-errors.filter.js';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { AuthController, UsersController } from './auth.controller.js';
import { AuthRateGuard, OriginGuard, SessionGuard } from './auth.guards.js';
import { GoogleProvider, GoogleService } from './google.service.js';
let AuthModule = class AuthModule {
};
AuthModule = __decorate([
    Module({
        imports: [DatabaseModule],
        controllers: [
            AuthController,
            UsersController,
            AvatarController,
            AvatarFilesController,
        ],
        providers: [
            AvatarService,
            { provide: AvatarStorage, useClass: LocalAvatarStorage },
            { provide: APP_FILTER, useClass: SafeErrorsFilter },
            OAuthRedirectFilter,
            AuthConfig,
            AuthService,
            GoogleProvider,
            GoogleService,
            SessionGuard,
            OriginGuard,
            AuthRateGuard,
            {
                provide: APP_PIPE,
                useFactory: () => new ValidationPipe({
                    transform: true,
                    whitelist: true,
                    forbidNonWhitelisted: true,
                    validationError: { target: false, value: false },
                }),
            },
        ],
        exports: [AuthConfig, AuthService, SessionGuard, OriginGuard],
    })
], AuthModule);
export { AuthModule };
//# sourceMappingURL=auth.module.js.map
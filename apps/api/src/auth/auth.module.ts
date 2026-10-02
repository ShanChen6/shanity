import {
  AvatarController,
  AvatarFilesController,
} from '../avatar/avatar.controller.js';
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
@Module({
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
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
          validationError: { target: false, value: false },
        }),
    },
  ],
  exports: [AuthConfig, AuthService, SessionGuard, OriginGuard],
})
export class AuthModule {}

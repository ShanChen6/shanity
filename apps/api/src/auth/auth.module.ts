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
  controllers: [AuthController, UsersController],
  providers: [
    { provide: APP_FILTER, useClass: SafeErrorsFilter },
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
  exports: [AuthService, SessionGuard, OriginGuard],
})
export class AuthModule {}

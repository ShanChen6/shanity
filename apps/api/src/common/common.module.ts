import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { DomainAccessGuard } from './domain-access.guard.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

/** Cross-cutting HTTP behaviour: domain isolation, envelope, error handling. */
@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: DomainAccessGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class CommonModule {}

import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthConfig } from './auth/auth.config.js';
import { AppLogger } from './common/app-logger.js';
import { apiV1Middleware } from './common/api-v1.middleware.js';
import { httpAccessLogMiddleware } from './common/http-access-log.middleware.js';
import {
  CORRELATION_ID_HEADER,
  requestContextMiddleware,
} from './common/request-context.js';
export function configureApp(app: INestApplication) {
  app.useLogger(new AppLogger());
  app.enableCors({
    origin: app.get(AuthConfig).origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Lets the web app show the id when reporting a failed request.
    exposedHeaders: [CORRELATION_ID_HEADER],
  });
  app.use(requestContextMiddleware);
  app.use(httpAccessLogMiddleware);
  app.use(cookieParser());
  // After cookies/logging: rewrites /api/v1/<domain>/* onto the legacy route.
  app.use(apiV1Middleware);
  app.enableShutdownHooks();
}

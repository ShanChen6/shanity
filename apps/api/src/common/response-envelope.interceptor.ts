import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { successEnvelope } from './api-response.js';
import type { ApiV1Request } from './api-v1.middleware.js';
import { currentCorrelationId } from './request-context.js';

/** Wraps successful `/api/v1/<domain>/*` results in the standard envelope. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ApiV1Request>();
    if (!request.apiV1) return next.handle();
    const response = http.getResponse<Response>();
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          response.headersSent ||
          response.statusCode === 204 ||
          value instanceof StreamableFile ||
          Buffer.isBuffer(value)
        )
          return value;
        // A handler that chose a non-JSON content type owns its body.
        const contentType = response.getHeader('Content-Type');
        if (typeof contentType === 'string' && !contentType.includes('json'))
          return value;
        return successEnvelope(
          response.statusCode,
          value,
          currentCorrelationId(),
        );
      }),
    );
  }
}

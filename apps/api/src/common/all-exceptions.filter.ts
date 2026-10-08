import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { errorEnvelope } from './api-response.js';
import type { ApiV1Request } from './api-v1.middleware.js';
import { currentContext } from './request-context.js';

const INTERNAL_MESSAGE = 'Internal server error';

/**
 * Last line of defence for every route.
 *
 * - Always answers with a stable shape: the v1 envelope on `/api/v1/<domain>`
 *   routes, the established `{ statusCode, message, … }` body elsewhere.
 * - Logs every failure with the request's correlation id (also returned in the
 *   `X-Correlation-Id` header), so a user-reported id leads to one log line.
 * - Never logs raw error messages: database and provider errors can embed
 *   queries, bound values or credentials. Only the error class, safe driver
 *   codes and stack frames are recorded.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<ApiV1Request>();
    const response = http.getResponse<Response>();
    const context = currentContext();
    const correlationId = context?.correlationId;

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    this.log(exception, status, request, correlationId);
    if (response.headersSent) return;

    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    if (!request.apiV1) {
      response
        .status(status)
        .json(
          exception instanceof HttpException
            ? typeof body === 'string'
              ? { statusCode: status, message: body }
              : body
            : { statusCode: 500, message: INTERNAL_MESSAGE },
        );
      return;
    }
    response.status(status).json(this.envelope(status, body, correlationId));
  }

  private envelope(status: number, body: unknown, correlationId?: string) {
    if (status >= 500 || body === undefined)
      return errorEnvelope(status, INTERNAL_MESSAGE, { correlationId });
    if (typeof body === 'string')
      return errorEnvelope(status, body, { correlationId });
    const { message, error, errors, statusCode, ...details } = body as Record<
      string,
      unknown
    >;
    void statusCode;
    const messages = Array.isArray(message)
      ? message.filter((item): item is string => typeof item === 'string')
      : typeof message === 'string'
        ? [message]
        : [];
    const extra = Array.isArray(errors)
      ? errors.filter((item): item is string => typeof item === 'string')
      : [];
    return errorEnvelope(
      status,
      messages.length === 1
        ? messages[0]!
        : messages.length > 1
          ? 'Validation failed'
          : typeof error === 'string'
            ? error
            : 'Request failed',
      {
        errors: messages.length > 1 ? [...messages, ...extra] : extra,
        // Structured fields such as `code` stay available to clients.
        details: Object.keys(details).length ? details : undefined,
        correlationId,
      },
    );
  }

  private log(
    exception: unknown,
    status: number,
    request: ApiV1Request,
    correlationId?: string,
  ) {
    const fields = {
      correlationId,
      method: request.method,
      path: request.originalUrl.split('?')[0],
      status,
      ...(request.apiV1 ? { domain: request.apiV1.domain } : {}),
      ...describe(exception),
    };
    if (status >= 500) this.logger.error(fields);
    else if (status === 401 || status === 403 || status === 429)
      this.logger.warn(fields);
    else this.logger.debug(fields);
  }
}

/** Diagnostic fields that cannot leak query text, bound values or secrets. */
function describe(exception: unknown): Record<string, unknown> {
  if (!(exception instanceof Error))
    return { error: typeof exception };
  const out: Record<string, unknown> = { error: exception.name };
  // TypeORM wraps the pg error; only its identifying codes are safe to keep.
  const driver = (exception as { driverError?: unknown }).driverError;
  const source = (driver ?? exception) as Record<string, unknown>;
  if (typeof source.code === 'string') out.code = source.code;
  if (typeof source.constraint === 'string') out.constraint = source.constraint;
  if (typeof source.table === 'string') out.table = source.table;
  if (!(exception instanceof HttpException) && exception.stack)
    out.frames = exception.stack
      .split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .slice(0, 6)
      .map((line) => line.trim());
  return out;
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export interface RequestContext {
  correlationId: string;
  method: string;
  /** Path without the query string; queries can carry tokens. */
  path: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

// Only accept ids a caller could not use to forge log lines or headers.
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Opens a per-request context so every log line can carry the correlation id. */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.header(CORRELATION_ID_HEADER);
  const correlationId =
    incoming && SAFE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  storage.run(
    {
      correlationId,
      method: req.method,
      path: req.originalUrl.split('?')[0] ?? req.originalUrl,
    },
    next,
  );
}

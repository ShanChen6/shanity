import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { currentCorrelationId } from './request-context.js';

const logger = new Logger('Http');

/** One structured line per finished request (path only; never the query). */
export function httpAccessLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = process.hrtime.bigint();
  const correlationId = currentCorrelationId();
  const path = req.originalUrl.split('?')[0];
  res.on('finish', () => {
    const fields = {
      correlationId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    };
    // Probes would otherwise drown the log.
    if (path?.startsWith('/health')) logger.debug(fields);
    else logger.log(fields);
  });
  next();
}

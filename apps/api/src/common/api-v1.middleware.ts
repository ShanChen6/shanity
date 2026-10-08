import type { NextFunction, Request, Response } from 'express';
import { resolveApiV1, type ApiDomain } from './api-v1-routes.js';

/** Set on requests that entered through `/api/v1/<domain>/*`. */
export interface ApiV1Marker {
  domain: ApiDomain;
}
export type ApiV1Request = Request & { apiV1?: ApiV1Marker };

/**
 * Runs before routing: tags the request with its domain and rewrites the URL
 * to the legacy route it aliases. Everything downstream (guards, pipes,
 * controllers) therefore sees the very route it always did.
 */
export function apiV1Middleware(
  req: ApiV1Request,
  _res: Response,
  next: NextFunction,
) {
  const queryStart = req.url.indexOf('?');
  const pathname = queryStart === -1 ? req.url : req.url.slice(0, queryStart);
  const resolved = resolveApiV1(req.method, pathname);
  if (resolved) {
    req.apiV1 = { domain: resolved.domain };
    if (resolved.legacyPath)
      req.url = `${resolved.legacyPath}${queryStart === -1 ? '' : req.url.slice(queryStart)}`;
  }
  next();
}

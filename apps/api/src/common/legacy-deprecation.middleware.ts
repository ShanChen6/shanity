import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { findApiV1Successors } from './api-v1-routes.js';
import type { ApiV1Request } from './api-v1.middleware.js';
import { currentCorrelationId } from './request-context.js';

/**
 * Deprecation policy for the unprefixed routes that now have `/api/v1`
 * aliases (RFC 9745 `Deprecation`, RFC 8594 `Sunset`).
 *
 *  - `deprecatedSince`: when the old URLs were announced as deprecated.
 *  - `sunset`: from this instant the old URLs answer 410 Gone. Unset = no
 *    removal date announced yet, which also means nothing is ever refused.
 */
export interface LegacyRoutePolicy {
  deprecatedSince: Date;
  sunset?: Date;
}

export const DEFAULT_DEPRECATED_SINCE = '2026-10-09T00:00:00Z';

function parseDate(name: string, value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`${name} must be an ISO 8601 date, got "${value}"`);
  return date;
}

/** Fails at startup on a malformed date rather than silently never sunsetting. */
export function readLegacyRoutePolicy(
  env: NodeJS.ProcessEnv = process.env,
): LegacyRoutePolicy {
  const since = env.LEGACY_ROUTES_DEPRECATED_SINCE?.trim();
  const sunset = env.LEGACY_ROUTES_SUNSET?.trim();
  const policy = {
    deprecatedSince: parseDate(
      'LEGACY_ROUTES_DEPRECATED_SINCE',
      since || DEFAULT_DEPRECATED_SINCE,
    ),
    ...(sunset && { sunset: parseDate('LEGACY_ROUTES_SUNSET', sunset) }),
  };
  if (policy.sunset && policy.sunset <= policy.deprecatedSince)
    throw new Error(
      'LEGACY_ROUTES_SUNSET must be later than LEGACY_ROUTES_DEPRECATED_SINCE',
    );
  return policy;
}

/** Headers an old route carries, so clients and gateways can see the migration. */
export const LEGACY_ROUTE_HEADERS = ['Deprecation', 'Sunset', 'Link'] as const;

/**
 * Runs after the v1 router: requests that entered through `/api/v1` are
 * skipped, every other request to a route with an alias is annotated, and once
 * the sunset instant has passed it is refused with 410 and the new location.
 */
export function legacyDeprecationMiddleware(
  policy: LegacyRoutePolicy,
  now: () => Date = () => new Date(),
) {
  const logger = new Logger('LegacyRoute');
  const reported = new Set<string>();
  const since = `@${Math.floor(policy.deprecatedSince.getTime() / 1000)}`;

  return (req: ApiV1Request, res: Response, next: NextFunction) => {
    if (req.apiV1) return next();
    const queryStart = req.url.indexOf('?');
    const pathname = queryStart === -1 ? req.url : req.url.slice(0, queryStart);
    const match = findApiV1Successors(req.method, pathname);
    if (!match) return next();

    res.setHeader('Deprecation', since);
    if (policy.sunset) res.setHeader('Sunset', policy.sunset.toUTCString());
    res.setHeader(
      'Link',
      match.successors
        .map((href) => `<${href}>; rel="successor-version"`)
        .join(', '),
    );

    // Once per route per process: enough to see which old URLs are still in
    // use before removing them, without a line per request.
    const key = `${req.method} ${match.pattern}`;
    if (!reported.has(key)) {
      reported.add(key);
      logger.warn({
        correlationId: currentCorrelationId(),
        route: key,
        successors: match.successors,
      });
    }

    if (policy.sunset && now() >= policy.sunset) {
      res.status(410).json({
        statusCode: 410,
        message: 'This endpoint has been removed. Use the /api/v1 URL.',
        successors: match.successors,
      });
      return;
    }
    next();
  };
}

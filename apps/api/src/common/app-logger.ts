import type { LoggerService } from '@nestjs/common';
import pino, { type DestinationStream, type Logger } from 'pino';
import { currentContext } from './request-context.js';

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface AppLoggerOptions {
  level?: string;
  destination?: DestinationStream;
}

function defaultLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

/**
 * Nest logger backed by pino. Every line carries the request's correlation id
 * (when logged inside a request) so one failing call can be traced end to end.
 */
export class AppLogger implements LoggerService {
  private readonly pino: Logger;

  constructor(options: AppLoggerOptions = {}) {
    this.pino = pino(
      {
        level: options.level ?? defaultLevel(),
        base: { service: 'shanity-api' },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      options.destination,
    );
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]) {
    this.write('trace', message, params);
  }
  fatal(message: unknown, ...params: unknown[]) {
    this.write('fatal', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[]) {
    const last = params.at(-1);
    // A trailing string is Nest's context unless it is a stack trace.
    const context =
      typeof last === 'string' && !last.includes('\n') ? last : undefined;
    const bindings = {
      context,
      correlationId: currentContext()?.correlationId,
    };
    if (message !== null && typeof message === 'object')
      this.pino[level]({ ...bindings, ...message });
    else this.pino[level](bindings, String(message));
  }
}

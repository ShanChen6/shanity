import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../src/common/all-exceptions.filter.js';
import { requestContextMiddleware } from '../../src/common/request-context.js';

type Sent = { status: number; body: any };

function run(exception: unknown, apiV1 = true): Sent {
  let sent: Sent = { status: 0, body: undefined };
  const response = {
    headersSent: false,
    status(code: number) {
      sent = { ...sent, status: code };
      return this;
    },
    json(body: unknown) {
      sent = { ...sent, body };
      return this;
    },
  };
  const request = {
    method: 'GET',
    originalUrl: '/api/v1/student/courses?token=secret',
    ...(apiV1 ? { apiV1: { domain: 'student' } } : {}),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  // The real middleware opens the context the filter reads the id from.
  requestContextMiddleware(
    {
      method: 'GET',
      originalUrl: request.originalUrl,
      header: () => 'corr-12345678',
    } as never,
    { setHeader: () => undefined } as never,
    () => new AllExceptionsFilter().catch(exception, host),
  );
  return sent;
}

describe('AllExceptionsFilter', () => {
  const logged: unknown[] = [];
  beforeEach(() => {
    logged.length = 0;
    for (const level of ['error', 'warn', 'debug'] as const)
      vi.spyOn(Logger.prototype, level).mockImplementation((entry: unknown) => {
        logged.push(entry);
      });
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers a v1 request with the error envelope and the correlation id', () => {
    const { status, body } = run(new ForbiddenException('Không đủ quyền.'));
    expect(status).toBe(403);
    expect(body).toEqual({
      success: false,
      statusCode: 403,
      message: 'Không đủ quyền.',
      data: null,
      correlationId: 'corr-12345678',
    });
  });

  it('lists several validation messages and keeps a single one as the message', () => {
    const many = run(
      new BadRequestException(['a is required', 'b is invalid']),
    );
    expect(many.body).toMatchObject({
      message: 'Validation failed',
      errors: ['a is required', 'b is invalid'],
    });
    const single = run(new BadRequestException('a is required'));
    expect(single.body.message).toBe('a is required');
    expect(single.body).not.toHaveProperty('errors');
  });

  it('keeps the message when the exception also carries an errors list', () => {
    const { body } = run(
      new BadRequestException({
        message: 'Import failed',
        errors: ['row 2: bad slug', 'row 5: missing title'],
      }),
    );
    expect(body.message).toBe('Import failed');
    expect(body.errors).toEqual([
      'Import failed',
      'row 2: bad slug',
      'row 5: missing title',
    ]);
  });

  it('uses an errors-only exception as the list', () => {
    const { body } = run(
      new BadRequestException({ errors: ['row 2: bad slug'] }),
    );
    expect(body.errors).toEqual(['row 2: bad slug']);
  });

  it('keeps structured fields such as code in data', () => {
    const { body } = run(
      new ConflictException({
        message: 'Hoàn thành bài trước.',
        code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
        requiredLesson: { id: 'l1' },
      }),
    );
    expect(body.data).toEqual({
      code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
      requiredLesson: { id: 'l1' },
    });
  });

  it('keeps the established body on routes outside /api/v1', () => {
    const { body } = run(new ForbiddenException('Không đủ quyền.'), false);
    expect(body).toMatchObject({ statusCode: 403, message: 'Không đủ quyền.' });
    expect(body).not.toHaveProperty('success');
  });

  it('hides the cause of an unexpected failure from the client', () => {
    const secret = 'duplicate key value violates "users_email_key" for hunter2';
    const v1 = run(new Error(secret));
    expect(v1.status).toBe(500);
    expect(v1.body.message).toBe('Internal server error');
    expect(JSON.stringify(v1.body)).not.toContain('hunter2');
    const legacy = run(new Error(secret), false);
    expect(legacy.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('never writes a raw error message or the query string to the log', () => {
    const error = Object.assign(new Error('INSERT ... VALUES (hunter2)'), {
      driverError: {
        code: '23505',
        constraint: 'users_email_key',
        table: 'users',
        detail: 'Key (email)=(hunter2@example.com) already exists.',
      },
    });
    run(error);
    const written = JSON.stringify(logged);
    expect(written).not.toContain('hunter2');
    expect(written).not.toContain('token=secret');
    expect(logged[0]).toMatchObject({
      correlationId: 'corr-12345678',
      status: 500,
      code: '23505',
      constraint: 'users_email_key',
      table: 'users',
      path: '/api/v1/student/courses',
    });
  });

  it('logs 5xx as errors and routine client errors quietly', () => {
    const error = vi.spyOn(Logger.prototype, 'error');
    const debug = vi.spyOn(Logger.prototype, 'debug');
    run(new HttpException('boom', 503));
    run(new BadRequestException('nope'));
    expect(error).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(1);
  });
});

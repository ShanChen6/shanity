import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

// Never log raw database/provider exceptions: they can contain queries or credentials.
@Injectable()
@Catch()
export class SafeErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeErrorsFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: exception.getStatus(), message: body }
            : body,
        );
      return;
    }
    this.logger.error('Unhandled request failure');
    response
      .status(500)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}

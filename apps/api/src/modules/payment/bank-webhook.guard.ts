import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class BankWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const configured = process.env.BANK_WEBHOOK_API_KEY;
    const supplied = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-api-key');
    if (!configured || !supplied)
      throw new UnauthorizedException('Invalid bank webhook credentials');
    const expected = Buffer.from(configured);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException('Invalid bank webhook credentials');
    return true;
  }
}

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  PipeTransform,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentProviderEnum } from './interfaces/index.js';
import { PaymentWebhookService } from './payment-webhook.service.js';

/** `/payments/webhook/vietqr` -> VIETQR; anything unknown is a 404. */
class ParseProviderPipe implements PipeTransform<string, PaymentProviderEnum> {
  transform(value: string) {
    const provider = Object.values(PaymentProviderEnum).find(
      (candidate) => candidate === value.toUpperCase(),
    );
    if (!provider) throw new NotFoundException('PAYMENT_PROVIDER_UNAVAILABLE');
    return provider;
  }
}

/**
 * Single, gateway-agnostic entry point for asynchronous notifications. No
 * session or API-key guard here: authenticity is each provider's
 * `verifyNotification`, which the service enforces before anything else.
 */
@Controller('payments/webhook')
export class WebhookController {
  constructor(private readonly webhooks: PaymentWebhookService) {}

  @Post(':provider')
  @HttpCode(200)
  handle(
    @Param('provider', new ParseProviderPipe()) provider: PaymentProviderEnum,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: Record<string, unknown>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.webhooks.handleNotification(provider, {
      headers,
      payload: payload ?? {},
      rawBody: req.rawBody,
    });
  }
}

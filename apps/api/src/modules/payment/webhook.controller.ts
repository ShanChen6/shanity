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
import { WebhookProcessorService } from './webhook-processor.service.js';

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
 * Step 1 of the pipeline: receive. One gateway-agnostic entry point, also
 * served under `/api/v1` for gateways configured with a versioned URL. No
 * session guard: authenticity is the provider's `verifyNotification`.
 */
@Controller(['payments/webhook', 'api/v1/payments/webhook'])
export class WebhookController {
  constructor(private readonly processor: WebhookProcessorService) {}

  @Post(':provider')
  @HttpCode(200)
  handle(
    @Param('provider', new ParseProviderPipe()) provider: PaymentProviderEnum,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: Record<string, unknown>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.processor.handleWebhook(
      provider,
      payload ?? {},
      headers,
      req.rawBody,
    );
  }
}

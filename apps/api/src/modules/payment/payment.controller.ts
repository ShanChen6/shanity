import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../../auth/auth.guards.js';
import type { Request } from 'express';
import { BankWebhookGuard } from './bank-webhook.guard.js';
import { CreateOrderDto, VietQrWebhookDto } from './payment.dto.js';
import { PaymentService } from './payment.service.js';

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly payments: PaymentService) {}
  @Post() create(@Req() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return this.payments.createOrder(req.principal.id, dto.courseId);
  }
  @Get(':id/status')
  @Header('Cache-Control', 'no-store')
  getStatus(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.status(req.principal.id, id);
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}
  @Post('webhook/vietqr')
  @UseGuards(BankWebhookGuard)
  @HttpCode(200)
  webhook(@Body() dto: VietQrWebhookDto, @Req() req: Request) {
    return this.payments.processWebhook(
      dto,
      req.body as Record<string, unknown>,
    );
  }
}

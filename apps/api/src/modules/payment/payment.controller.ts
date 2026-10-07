import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../../auth/auth.guards.js';
import type { Request } from 'express';
import { BankWebhookGuard } from './bank-webhook.guard.js';
import { OrderStatus } from './entities/order.entity.js';
import { OrderFactoryService } from './order-factory.service.js';
import { OrderQueryService } from './order-query.service.js';
import type { OrderView } from './order-view.js';
import { CreateOrderDto, VietQrWebhookDto } from './payment.dto.js';
import { PaymentService } from './payment.service.js';
import { buildVietQrUrl } from './vietqr.js';

// A QR is only useful while the order can still be paid.
const withCheckout = (order: OrderView) =>
  order.status === OrderStatus.PENDING && order.expiresAt > new Date()
    ? { ...order, qrCodeUrl: buildVietQrUrl(order) }
    : order;

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(
    private readonly payments: PaymentService,
    private readonly factory: OrderFactoryService,
    private readonly queries: OrderQueryService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return withCheckout(await this.factory.createOrder(req.principal.id, dto));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: AuthRequest,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.queries.listUserOrders(req.principal.id, { limit, offset });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const admin = req.principal.roles.includes('admin');
    return withCheckout(
      await this.queries.getOrderDetails(
        id,
        admin ? {} : { userId: req.principal.id },
      ),
    );
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

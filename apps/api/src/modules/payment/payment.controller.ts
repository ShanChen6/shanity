import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../../auth/auth.guards.js';
import { CheckoutService } from './checkout.service.js';
import { OrderFactoryService } from './order-factory.service.js';
import { OrderQueryService } from './order-query.service.js';
import { CreateOrderDto, InitiateCheckoutDto } from './payment.dto.js';
import { PaymentService } from './payment.service.js';

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(
    private readonly payments: PaymentService,
    private readonly factory: OrderFactoryService,
    private readonly queries: OrderQueryService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return this.factory.createOrder(req.principal.id, dto);
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
  detail(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const admin = req.principal.roles.includes('admin');
    return this.queries.getOrderDetails(
      id,
      admin ? {} : { userId: req.principal.id },
    );
  }

  @Post(':id/checkout')
  @Header('Cache-Control', 'no-store')
  startCheckout(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InitiateCheckoutDto,
  ) {
    return this.checkout.initiateCheckout(req.principal.id, id, dto.provider, {
      returnUrl: dto.returnUrl,
      cancelUrl: dto.cancelUrl,
    });
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

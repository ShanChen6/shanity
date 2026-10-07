import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  OriginGuard,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { CheckoutService } from './checkout.service.js';
import { clientIp, OrderAuditService } from './order-audit.service.js';
import { OrderFactoryService } from './order-factory.service.js';
import { OrderQueryService } from './order-query.service.js';
import {
  CreateOrderDto,
  InitiateCheckoutDto,
  StudentOrdersQueryDto,
} from './payment.dto.js';
import { PaymentService } from './payment.service.js';
import { StudentOrdersService } from './student-orders.service.js';

// Every route is served at both `/x` and `/api/v1/x`.
@Controller(['orders', 'api/v1/orders'])
@UseGuards(OriginGuard, SessionGuard)
export class OrdersController {
  constructor(
    private readonly payments: PaymentService,
    private readonly factory: OrderFactoryService,
    private readonly queries: OrderQueryService,
    private readonly students: StudentOrdersService,
    private readonly checkout: CheckoutService,
    private readonly audit: OrderAuditService,
  ) {}

  /** Create (or reuse the identical unpaid) order from a course page. */
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

  /** `ref` is the order code (SHAN-YYYYMMDD-XXXX) or its UUID. */
  @Get(':ref')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() req: AuthRequest, @Param('ref') ref: string) {
    if (!req.principal.roles.includes('admin'))
      return this.students.get(req.principal.id, ref);
    // Staff reading someone else's order is a "detail view": always audited.
    const order = await this.queries.getOrderDetails(ref, { staff: true });
    await this.audit.recordView(
      {
        principal: req.principal,
        ipAddress: clientIp(req.ip),
        userAgent: req.get('user-agent') ?? null,
      },
      order.orderId,
      'Admin opened the order through the order API',
    );
    return order;
  }

  @Post(':ref/checkout')
  @Header('Cache-Control', 'no-store')
  startCheckout(
    @Req() req: AuthRequest,
    @Param('ref') ref: string,
    @Body() dto: InitiateCheckoutDto,
  ) {
    return this.checkout.initiateCheckout(req.principal.id, ref, dto.provider, {
      returnUrl: dto.returnUrl,
      cancelUrl: dto.cancelUrl,
    });
  }

  /** Lightweight poll target: `{ status, isPaid, expiresAt, serverTime }`. */
  @Get(':ref/status')
  @Header('Cache-Control', 'no-store')
  getStatus(@Req() req: AuthRequest, @Param('ref') ref: string) {
    return this.payments.status(req.principal.id, ref);
  }
}

@Controller(['student/orders', 'api/v1/student/orders'])
@UseGuards(SessionGuard)
export class StudentOrdersController {
  constructor(private readonly students: StudentOrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query() query: StudentOrdersQueryDto) {
    return this.students.list(req.principal.id, query);
  }
}

@Controller(['payments/methods', 'api/v1/payments/methods'])
@UseGuards(SessionGuard)
export class PaymentMethodsController {
  constructor(private readonly checkout: CheckoutService) {}

  /** Which gateways exist, are configured, and can charge `?currency=`. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('currency') currency?: string) {
    return this.checkout.listMethods(currency?.toUpperCase());
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import { clientIp, type AdminRequestContext } from '../order-audit.service.js';
import { AdminOrderQueryService } from './admin-order-query.service.js';
import {
  AdminOrdersQueryDto,
  ReconcileOrderDto,
  RefundOrderDto,
} from './admin-orders.dto.js';
import { OrderReconciliationService } from './order-reconciliation.service.js';
import { OrderRefundService } from './order-refund.service.js';
import {
  MAX_PROOF_BYTES,
  PaymentProofService,
} from './payment-proof.service.js';

/** Who is calling, from where: what an audit row needs about the request. */
export const adminContext = (req: AuthRequest): AdminRequestContext => ({
  principal: req.principal,
  ipAddress: clientIp(req.ip),
  userAgent: req.get('user-agent') ?? null,
});

/**
 * Back-office order console (admin and finance officers).
 *
 * There is deliberately NO route that writes an order's status: no PATCH, PUT
 * or DELETE, and no "mark as paid" POST. The only state changes are the two
 * audited workflows, `reconcile` and `refund`. Every route is also served at
 * `/admin/orders` and `/api/v1/admin/orders`.
 */
@Controller(['admin/orders', 'api/v1/admin/orders'])
@UseGuards(OriginGuard, SessionGuard)
@Roles('admin', 'finance_officer')
export class AdminOrdersController {
  constructor(
    private readonly queries: AdminOrderQueryService,
    private readonly reconciliation: OrderReconciliationService,
    private readonly refunds: OrderRefundService,
    private readonly proofs: PaymentProofService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AdminOrdersQueryDto) {
    return this.queries.list(query);
  }

  /** `id` is the order's UUID or its code. Opening it writes a DETAIL_VIEWED audit row. */
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.queries.detail(id, adminContext(req));
  }

  @Post(':id/reconcile')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  reconcile(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ReconcileOrderDto,
  ) {
    return this.reconciliation.reconcile(id, dto, adminContext(req));
  }

  @Post(':id/refund')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  refund(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.refunds.refund(id, dto, adminContext(req));
  }

  @Post(':id/proofs')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PROOF_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  uploadProof(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.proofs.upload(id, file, adminContext(req));
  }

  @Get(':id/proofs/:key')
  @Header('Cache-Control', 'no-store')
  async proof(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Param('key') key: string,
  ) {
    const { data, contentType } = await this.proofs.read(
      id,
      key,
      adminContext(req),
    );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(data);
  }
}

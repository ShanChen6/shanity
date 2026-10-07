import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminOrderQueryService } from './admin/admin-order-query.service.js';
import { AdminOrdersController } from './admin/admin-orders.controller.js';
import { OrderReconciliationService } from './admin/order-reconciliation.service.js';
import { OrderRefundService } from './admin/order-refund.service.js';
import { PaymentProofService } from './admin/payment-proof.service.js';
import {
  LocalPaymentProofStorage,
  PaymentProofStorage,
} from './admin/payment-proof.storage.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEventsModule } from './events/payment-events.module.js';
import {
  PAYMENT_LEDGER_READER,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from './interfaces/index.js';
import { OrderAuditService } from './order-audit.service.js';
import { OrderFactoryService } from './order-factory.service.js';
import { LoggingOrderNotifier, OrderNotifier } from './order-notifier.js';
import { OrderQueryService } from './order-query.service.js';
import {
  OrdersController,
  PaymentMethodsController,
  StudentOrdersController,
} from './payment.controller.js';
import { StudentOrdersService } from './student-orders.service.js';
import { PaymentExpirationWorker } from './payment-expiration.worker.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';
import { PaymentReconciliationWorker } from './payment-reconciliation.worker.js';
import { PaymentTransactionService } from './payment-transaction.service.js';
import { PaymentSettlementService } from './payment-settlement.service.js';
import { PaymentService } from './payment.service.js';
import { PAYMENT_HTTP_FETCH, type FetchLike } from './providers/http-fetch.js';
import { StripeProviderAdapter } from './providers/stripe/stripe-provider.adapter.js';
import { VietQRProviderAdapter } from './providers/vietqr/vietqr-provider.adapter.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookProcessorService } from './webhook-processor.service.js';

/**
 * Wiring. Adding a gateway = write an adapter implementing `PaymentProvider`,
 * add it to `providers` and to the PAYMENT_PROVIDERS list below. Core
 * services (checkout, webhook, orders, enrolment) are not touched.
 */
@Module({
  imports: [DatabaseModule, AuthModule, PaymentEventsModule],
  controllers: [
    OrdersController,
    StudentOrdersController,
    PaymentMethodsController,
    WebhookController,
    AdminOrdersController,
  ],
  providers: [
    PaymentService,
    PaymentTransactionService,
    OrderAuditService,
    OrderFactoryService,
    OrderQueryService,
    StudentOrdersService,
    AdminOrderQueryService,
    OrderReconciliationService,
    OrderRefundService,
    PaymentProofService,
    { provide: PaymentProofStorage, useClass: LocalPaymentProofStorage },
    { provide: OrderNotifier, useClass: LoggingOrderNotifier },
    CheckoutService,
    PaymentSettlementService,
    WebhookProcessorService,
    PaymentReconciliationService,
    PaymentExpirationWorker,
    PaymentReconciliationWorker,
    PaymentProviderFactory,

    // Concrete strategies
    VietQRProviderAdapter,
    StripeProviderAdapter,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (...providers: PaymentProvider[]) => providers,
      inject: [VietQRProviderAdapter, StripeProviderAdapter],
    },

    // Ports
    { provide: PAYMENT_LEDGER_READER, useExisting: PaymentTransactionService },
    {
      provide: PAYMENT_HTTP_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies FetchLike,
    },
  ],
  exports: [
    PaymentService,
    PaymentTransactionService,
    OrderAuditService,
    OrderFactoryService,
    OrderQueryService,
    CheckoutService,
    PaymentSettlementService,
    WebhookProcessorService,
    PaymentProviderFactory,
  ],
})
export class PaymentModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEventsModule } from './events/payment-events.module.js';
import {
  PAYMENT_LEDGER_READER,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from './interfaces/index.js';
import { OrderFactoryService } from './order-factory.service.js';
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
  ],
  providers: [
    PaymentService,
    PaymentTransactionService,
    OrderFactoryService,
    OrderQueryService,
    StudentOrdersService,
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
    OrderFactoryService,
    OrderQueryService,
    CheckoutService,
    PaymentSettlementService,
    WebhookProcessorService,
    PaymentProviderFactory,
  ],
})
export class PaymentModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { BankWebhookGuard } from './bank-webhook.guard.js';
import { OrdersController, PaymentsController } from './payment.controller.js';
import { PaymentExpirationWorker } from './payment-expiration.worker.js';
import { PaymentService } from './payment.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [OrdersController, PaymentsController],
  providers: [PaymentService, BankWebhookGuard, PaymentExpirationWorker],
  exports: [PaymentService],
})
export class PaymentModule {}

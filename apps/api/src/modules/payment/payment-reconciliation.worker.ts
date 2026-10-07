import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';

const INTERVAL_MS = 5 * 60_000;

@Injectable()
export class PaymentReconciliationWorker
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentReconciliationWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly reconciliation: PaymentReconciliationService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Public for tests; sweeps never overlap. */
  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconciliation.reconcilePendingCheckouts();
      await this.reconciliation.republishUnfulfilledOrders();
    } catch (error) {
      this.logger.error('Payment reconciliation sweep failed', String(error));
    } finally {
      this.running = false;
    }
  }
}

import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PaymentService } from './payment.service.js';

@Injectable()
export class PaymentExpirationWorker
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentExpirationWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly payments: PaymentService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.payments
        .expirePendingOrders()
        .catch((error: unknown) =>
          this.logger.error('Order expiration sweep failed', error),
        );
    }, 5 * 60_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}

import { Injectable, Logger } from '@nestjs/common';

export interface RefundNotice {
  orderCode: string;
  studentEmail: string;
  amount: number;
  currency: string;
  fullyRefunded: boolean;
}

/**
 * Port for telling a student about a refund. The platform has no mail
 * transport yet, so the default adapter only logs; swap the provider in
 * PaymentModule when one exists. Called after COMMIT and never allowed to fail
 * a refund that already happened.
 */
export abstract class OrderNotifier {
  abstract refundIssued(notice: RefundNotice): Promise<void>;
}

@Injectable()
export class LoggingOrderNotifier extends OrderNotifier {
  private readonly logger = new Logger(LoggingOrderNotifier.name);

  refundIssued(notice: RefundNotice) {
    this.logger.log(
      `Refund notice for order ${notice.orderCode}: ${notice.amount} ${notice.currency}` +
        `${notice.fullyRefunded ? ' (full)' : ' (partial)'} -> student notified (log only)`,
    );
    return Promise.resolve();
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthConfig } from '../../auth/auth.config.js';
import { DatabaseService } from '../../database/database.module.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { PaymentTransactionStatus } from './entities/payment-transaction.entity.js';
import {
  PaymentProviderEnum,
  type BankTransferInstructions,
} from './interfaces/index.js';
import { orderLookup } from './order-ref.js';
import { toMinorUnits } from './money.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { PaymentTransactionService } from './payment-transaction.service.js';

export interface CheckoutOptions {
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResult {
  orderId: string;
  orderCode: string;
  provider: PaymentProviderEnum;
  providerTransactionId: string;
  /** Redirect the buyer here (hosted checkout)... */
  paymentUrl?: string;
  /** ...or show this scannable code. */
  qrCodeUrl?: string;
  amount: number;
  currency: string;
  /** Bank-transfer details for the copy buttons (bank-transfer gateways only). */
  transfer?: BankTransferInstructions;
  /** The order stays payable until at least this moment. */
  expiresAt: Date;
}

const DESCRIPTION_MAX = 120;
const MAX_PAYMENT_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Starts a payment for an existing PENDING order through whichever gateway
 * the buyer picked. Depends only on the `PaymentProvider` abstraction.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly factory: PaymentProviderFactory,
    private readonly database: DatabaseService,
    private readonly ledger: PaymentTransactionService,
    private readonly auth: AuthConfig,
  ) {}

  async initiateCheckout(
    userId: string,
    orderRef: string,
    providerName: PaymentProviderEnum,
    options: CheckoutOptions = {},
  ): Promise<CheckoutResult> {
    const provider = this.factory.getProvider(providerName);
    const manager = this.database.dataSource.manager;

    const lookup = orderLookup(orderRef);
    const order = lookup
      ? await manager.getRepository(Order).findOneBy({ ...lookup, userId })
      : null;
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
    const orderId = order.id;
    this.assertPayable(order);
    if (!provider.supportedCurrencies.includes(order.currency))
      throw new BadRequestException('PAYMENT_CURRENCY_NOT_SUPPORTED');

    // Description comes from the frozen item titles, not the live courses.
    const items = await manager.getRepository(OrderItem).find({
      where: { orderId },
      order: { position: 'ASC', id: 'ASC' },
    });
    const description = `Shanity ${order.code}: ${items
      .map((item) => item.courseTitleSnapshot)
      .join(', ')}`.slice(0, DESCRIPTION_MAX);
    const { returnUrl, cancelUrl } = this.redirectUrls(order, options);

    // The gateway call happens outside any DB transaction so a slow provider
    // never holds the order lock (and never blocks that order's webhook).
    const payment = await provider.createPayment({
      orderId: order.id,
      orderCode: order.code,
      amount: toMinorUnits(order.finalTotal),
      currency: order.currency,
      description,
      returnUrl,
      cancelUrl,
    });

    return this.database.dataSource.transaction(async (tx) => {
      const locked = await tx.getRepository(Order).findOne({
        where: { id: orderId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      // Paid, cancelled or expired while the gateway call was in flight.
      if (!locked) throw new NotFoundException('ORDER_NOT_FOUND');
      this.assertPayable(locked);

      await this.ledger.record(tx, {
        orderId: locked.id,
        provider: provider.providerName,
        providerTransactionId: payment.providerTransactionId,
        amount: locked.finalTotal,
        currency: locked.currency,
        status: PaymentTransactionStatus.INITIATED,
        rawPayload: payment.rawPayload,
      });

      // A payment made inside the gateway's own window must still settle.
      const ceiling = Date.now() + MAX_PAYMENT_WINDOW_MS;
      const expiresAt =
        payment.expiresAt &&
        payment.expiresAt > locked.expiresAt &&
        payment.expiresAt.getTime() <= ceiling
          ? payment.expiresAt
          : locked.expiresAt;
      await tx
        .getRepository(Order)
        .update(
          { id: locked.id },
          { paymentProvider: provider.providerName, expiresAt },
        );

      return {
        orderId: locked.id,
        orderCode: locked.code,
        provider: provider.providerName,
        providerTransactionId: payment.providerTransactionId,
        paymentUrl: payment.paymentUrl,
        qrCodeUrl: payment.qrCodeUrl,
        transfer: payment.transfer,
        amount: locked.finalTotal,
        currency: locked.currency,
        expiresAt,
      };
    });
  }

  /**
   * Gateways the buyer can pick for an order in `currency`. Unconfigured
   * gateways are reported as unavailable (the UI greys them out) rather than
   * hidden, so a half-configured environment is visible.
   */
  listMethods(currency?: string) {
    return Object.values(PaymentProviderEnum).map((name) => {
      const provider = this.factory.has(name)
        ? this.factory.getProvider(name)
        : null;
      return {
        provider: name,
        available: Boolean(provider && (provider.isAvailable?.() ?? true)),
        supportsCurrency:
          !provider ||
          currency === undefined ||
          provider.supportedCurrencies.includes(currency),
      };
    });
  }

  private assertPayable(order: Order) {
    if (order.status !== OrderStatus.PENDING)
      throw new ConflictException('ORDER_NOT_PAYABLE');
    if (order.expiresAt <= new Date())
      throw new ConflictException('ORDER_EXPIRED');
  }

  /** Only our own web origin may receive the buyer back (no open redirect). */
  private redirectUrls(order: Order, options: CheckoutOptions) {
    const origin = this.auth.origin;
    const allowed = (url: string | undefined, fallback: string) => {
      if (url === undefined) return fallback;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new BadRequestException('INVALID_REDIRECT_URL');
      }
      if (parsed.origin !== origin)
        throw new BadRequestException('INVALID_REDIRECT_URL');
      return parsed.href;
    };
    return {
      returnUrl: allowed(
        options.returnUrl,
        `${origin}/checkout/${order.code}?checkout=success`,
      ),
      cancelUrl: allowed(
        options.cancelUrl,
        `${origin}/checkout/${order.code}?checkout=cancelled`,
      ),
    };
  }
}

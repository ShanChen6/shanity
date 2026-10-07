import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../../money.js';
import {
  PAYMENT_LEDGER_READER,
  PaymentProviderEnum,
  PaymentStatusEnum,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentLedgerReader,
  type PaymentProvider,
  type QueryPaymentResult,
  type VerifyNotificationInput,
  type VerifyNotificationResult,
} from '../../interfaces/index.js';
import { extractOrderCode, toTransferContent } from '../../order-snapshot.js';
import { hmacSha256Hex, safeEqual } from '../secrets.js';
import { buildQrImageUrl, type VietQrFormat } from './vietqr-qr-url.js';
import { parseBankTransfer } from './vietqr-notification.js';

const header = (headers: Record<string, any>, name: string) => {
  const value: unknown = headers[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * VietQR bank-transfer gateway (works with SePay-style or plain forwarders).
 *
 * Authenticity of a notification = a shared API key (`x-api-key` or
 * `Authorization: Apikey <key>`), plus, when BANK_WEBHOOK_HMAC_SECRET is set,
 * an HMAC-SHA256 of the raw body in `x-signature`.
 */
@Injectable()
export class VietQRProviderAdapter implements PaymentProvider {
  readonly providerName = PaymentProviderEnum.VIETQR;
  readonly supportedCurrencies = ['VND'] as const;
  private readonly logger = new Logger(VietQRProviderAdapter.name);

  constructor(
    @Inject(PAYMENT_LEDGER_READER)
    private readonly ledger: PaymentLedgerReader,
  ) {}

  // async: validation failures must surface as rejections, never sync throws.
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.currency !== 'VND')
      throw new BadRequestException('PAYMENT_CURRENCY_NOT_SUPPORTED');
    const accountNo = process.env.VIETQR_ACCOUNT_NO;
    const bankId = process.env.VIETQR_BANK_ID;
    if (!accountNo || !bankId)
      throw new ServiceUnavailableException('PAYMENT_PROVIDER_NOT_CONFIGURED');

    const format: VietQrFormat =
      process.env.VIETQR_QR_FORMAT === 'sepay' ? 'sepay' : 'vietqr';
    const memo = toTransferContent(input.orderCode);
    const amount = fromMinorUnits(input.amount);
    const qrCodeUrl = buildQrImageUrl(
      format,
      {
        bankId,
        accountNo,
        accountName: process.env.VIETQR_ACCOUNT_NAME ?? '',
      },
      amount,
      memo,
    );
    return {
      // A QR is deterministic per order, so re-initiating returns the same id.
      providerTransactionId: `VIETQR-${input.orderCode}`,
      qrCodeUrl,
      rawPayload: { format, bankId, accountNo, amount, transferContent: memo },
    };
  }

  async verifyNotification(
    input: VerifyNotificationInput,
  ): Promise<VerifyNotificationResult> {
    if (!this.isAuthentic(input)) return this.rejected(input.payload);

    const transfer = parseBankTransfer(input.payload);
    return {
      isValid: true,
      // No recognisable code => money we cannot attribute; the core ignores it.
      orderCode: extractOrderCode(transfer.transferContent) ?? '',
      providerTransactionId: transfer.transactionId,
      amount: toMinorUnits(transfer.amount),
      currency: 'VND',
      // Debits are acknowledged but never settle anything.
      status: transfer.incoming
        ? PaymentStatusEnum.SUCCESS
        : PaymentStatusEnum.PENDING,
      memo: transfer.transferContent,
      rawPayload: input.payload,
    };
  }

  async queryPayment(
    orderCode: string,
    providerTransactionId?: string,
  ): Promise<QueryPaymentResult> {
    const settled = await this.ledger.findSuccessfulPayment(
      this.providerName,
      orderCode,
    );
    if (!settled)
      return {
        status: PaymentStatusEnum.PENDING,
        providerTransactionId: providerTransactionId ?? `VIETQR-${orderCode}`,
        amountPaid: 0n,
        currency: 'VND',
      };
    return {
      status: PaymentStatusEnum.SUCCESS,
      providerTransactionId: settled.providerTransactionId,
      amountPaid: toMinorUnits(settled.amount),
      currency: settled.currency,
      paidAt: settled.receivedAt,
    };
  }

  private isAuthentic({ headers, rawBody }: VerifyNotificationInput) {
    const configured = process.env.BANK_WEBHOOK_API_KEY;
    if (!configured) {
      this.logger.warn('BANK_WEBHOOK_API_KEY is not set; rejecting webhook');
      return false;
    }
    const authorization = header(headers, 'authorization');
    const supplied =
      header(headers, 'x-api-key') ??
      (authorization?.toLowerCase().startsWith('apikey ')
        ? authorization.slice('apikey '.length).trim()
        : undefined);
    if (!supplied || !safeEqual(configured, supplied)) return false;

    const hmacSecret = process.env.BANK_WEBHOOK_HMAC_SECRET;
    if (!hmacSecret) return true;
    const signature = header(headers, 'x-signature')?.replace(/^sha256=/i, '');
    return (
      !!rawBody &&
      !!signature &&
      safeEqual(hmacSha256Hex(hmacSecret, rawBody), signature.toLowerCase())
    );
  }

  private rejected(payload: Record<string, any>): VerifyNotificationResult {
    return {
      isValid: false,
      orderCode: '',
      providerTransactionId: '',
      amount: 0n,
      currency: '',
      status: PaymentStatusEnum.FAILED,
      rawPayload: payload,
    };
  }
}

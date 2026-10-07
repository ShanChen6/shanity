import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PaymentProviderEnum,
  PaymentStatusEnum,
  type PaymentLedgerReader,
} from '../../interfaces/index.js';
import { hmacSha256Hex } from '../secrets.js';
import { VietQRProviderAdapter } from './vietqr-provider.adapter.js';

const ENV = [
  'VIETQR_BANK_ID',
  'VIETQR_ACCOUNT_NO',
  'VIETQR_ACCOUNT_NAME',
  'VIETQR_QR_FORMAT',
  'BANK_WEBHOOK_API_KEY',
  'BANK_WEBHOOK_HMAC_SECRET',
] as const;

const ledger = (
  record: Awaited<
    ReturnType<PaymentLedgerReader['findSuccessfulPayment']>
  > = null,
) =>
  ({
    findSuccessfulPayment: () => Promise.resolve(record),
  }) satisfies PaymentLedgerReader;

const body = {
  transactionId: 'FT26280123',
  amount: 499000,
  transferContent: 'ck SHAN20261007X89K',
};
const raw = Buffer.from(JSON.stringify(body));

describe('VietQRProviderAdapter', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ENV) saved[key] = process.env[key];
    process.env.VIETQR_BANK_ID = '970422';
    process.env.VIETQR_ACCOUNT_NO = '123456789';
    process.env.VIETQR_ACCOUNT_NAME = 'SHANITY';
    process.env.BANK_WEBHOOK_API_KEY = 'k'.repeat(32);
    delete process.env.BANK_WEBHOOK_HMAC_SECRET;
    delete process.env.VIETQR_QR_FORMAT;
  });
  afterEach(() => {
    for (const key of ENV)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  });

  const adapter = (l = ledger()) => new VietQRProviderAdapter(l);
  const verify = (
    headers: Record<string, any>,
    payload: object = body,
    rawBody: Buffer | null = raw,
  ) =>
    adapter().verifyNotification({
      headers,
      payload,
      rawBody: rawBody ?? undefined,
    });

  describe('createPayment', () => {
    const input = {
      orderId: 'o1',
      orderCode: 'SHAN-20261007-X89K',
      amount: 499000n,
      currency: 'VND',
      description: 'x',
    };

    it('returns a dynamic QR carrying the dash-free order code', async () => {
      const result = await adapter().createPayment(input);
      const url = new URL(result.qrCodeUrl!);
      expect(url.hostname).toBe('img.vietqr.io');
      expect(url.searchParams.get('amount')).toBe('499000');
      expect(url.searchParams.get('addInfo')).toBe('SHAN20261007X89K');
      expect(result.providerTransactionId).toBe('VIETQR-SHAN-20261007-X89K');
      expect(result.paymentUrl).toBeUndefined();
      expect(() => JSON.stringify(result.rawPayload)).not.toThrow();
    });

    it('can render SePay-format QR codes', async () => {
      process.env.VIETQR_QR_FORMAT = 'sepay';
      const result = await adapter().createPayment(input);
      expect(new URL(result.qrCodeUrl!).hostname).toBe('qr.sepay.vn');
    });

    it('refuses non-VND and unconfigured accounts', async () => {
      await expect(
        adapter().createPayment({ ...input, currency: 'USD' }),
      ).rejects.toThrow(BadRequestException);
      delete process.env.VIETQR_ACCOUNT_NO;
      await expect(adapter().createPayment(input)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('verifyNotification', () => {
    const key = 'k'.repeat(32);

    it('accepts x-api-key and Authorization: Apikey, and translates the payload', async () => {
      for (const headers of [
        { 'x-api-key': key },
        { authorization: `Apikey ${key}` },
        { authorization: `apikey ${key}` },
      ]) {
        const result = await verify(headers);
        expect(result).toMatchObject({
          isValid: true,
          orderCode: 'SHAN-20261007-X89K',
          providerTransactionId: 'FT26280123',
          amount: 499000n,
          currency: 'VND',
          status: PaymentStatusEnum.SUCCESS,
          memo: 'ck SHAN20261007X89K',
        });
      }
    });

    it('rejects a missing, wrong or differently-sized key and an unset server key', async () => {
      for (const headers of [
        {},
        { 'x-api-key': 'wrong' },
        { 'x-api-key': key + 'x' },
        { authorization: 'Bearer ' + key },
        { 'x-api-key': ['a', 'b'] },
      ])
        expect((await verify(headers)).isValid).toBe(false);
      delete process.env.BANK_WEBHOOK_API_KEY;
      expect((await verify({ 'x-api-key': key })).isValid).toBe(false);
    });

    it('never trusts the payload of a rejected request', async () => {
      const result = await verify({});
      expect(result).toMatchObject({
        isValid: false,
        orderCode: '',
        providerTransactionId: '',
        amount: 0n,
      });
    });

    it('requires a valid body HMAC when BANK_WEBHOOK_HMAC_SECRET is set', async () => {
      process.env.BANK_WEBHOOK_HMAC_SECRET = 'hmac-secret';
      const good = hmacSha256Hex('hmac-secret', raw);
      const headers = { 'x-api-key': key };
      expect((await verify({ ...headers, 'x-signature': good })).isValid).toBe(
        true,
      );
      expect(
        (
          await verify({
            ...headers,
            'x-signature': `sha256=${good.toUpperCase()}`,
          })
        ).isValid,
      ).toBe(true);
      expect(
        (await verify({ ...headers, 'x-signature': 'f'.repeat(64) })).isValid,
      ).toBe(false);
      expect((await verify(headers)).isValid).toBe(false);
      expect(
        (await verify({ ...headers, 'x-signature': good }, body, null)).isValid,
      ).toBe(false);
      // a signature alone, without the API key, is not enough
      expect((await verify({ 'x-signature': good })).isValid).toBe(false);
      // a body altered after signing fails
      const tampered = Buffer.from(JSON.stringify({ ...body, amount: 1 }));
      expect(
        (await verify({ ...headers, 'x-signature': good }, body, tampered))
          .isValid,
      ).toBe(false);
    });

    it('acknowledges debits and unattributable credits without an order', async () => {
      const headers = { 'x-api-key': key };
      const debit = await verify(headers, {
        id: 1,
        referenceCode: 'FT1',
        transferType: 'out',
        transferAmount: 10,
        content: 'SHAN20261007X89K',
      });
      expect(debit.status).toBe(PaymentStatusEnum.PENDING);
      const stray = await verify(headers, {
        ...body,
        transferContent: 'tien an',
      });
      expect(stray).toMatchObject({
        isValid: true,
        orderCode: '',
        status: PaymentStatusEnum.SUCCESS,
      });
    });

    it('rejects an authenticated but malformed payload with 400', async () => {
      await expect(
        verify({ 'x-api-key': key }, { nope: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('queryPayment', () => {
    it('answers from verified notifications only', async () => {
      const paid = await adapter(
        ledger({
          providerTransactionId: 'FT1',
          amount: 499000,
          currency: 'VND',
          receivedAt: new Date('2026-10-07T01:00:00Z'),
        }),
      ).queryPayment('SHAN-20261007-X89K');
      expect(paid).toMatchObject({
        status: PaymentStatusEnum.SUCCESS,
        providerTransactionId: 'FT1',
        amountPaid: 499000n,
        paidAt: new Date('2026-10-07T01:00:00Z'),
      });
      const open = await adapter().queryPayment('SHAN-20261007-X89K');
      expect(open).toMatchObject({
        status: PaymentStatusEnum.PENDING,
        amountPaid: 0n,
      });
    });
  });

  it('identifies itself', () => {
    expect(adapter().providerName).toBe(PaymentProviderEnum.VIETQR);
    expect(adapter().supportedCurrencies).toEqual(['VND']);
  });
});

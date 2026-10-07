import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { buildQrImageUrl } from './vietqr-qr-url.js';
import { parseBankTransfer } from './vietqr-notification.js';

describe('parseBankTransfer', () => {
  it('reads the native shape', () => {
    expect(
      parseBankTransfer({
        transactionId: 'FT1',
        amount: 499000,
        transferContent: 'SHAN20261007X89K',
      }),
    ).toEqual({
      transactionId: 'FT1',
      amount: 499000,
      transferContent: 'SHAN20261007X89K',
      incoming: true,
    });
  });

  it('reads the SePay shape and ignores debits', () => {
    const sepay = {
      id: 92704,
      referenceCode: 'FT26280123',
      transferType: 'in',
      transferAmount: 499000,
      content: 'CK SHAN20261007X89K',
    };
    expect(parseBankTransfer(sepay)).toMatchObject({
      transactionId: 'FT26280123',
      amount: 499000,
      incoming: true,
    });
    expect(parseBankTransfer({ ...sepay, transferType: 'out' }).incoming).toBe(
      false,
    );
    expect(
      parseBankTransfer({ ...sepay, referenceCode: undefined }).transactionId,
    ).toBe('92704');
  });

  it.each([
    null,
    'text',
    [],
    {},
    { transactionId: '', amount: 1, transferContent: 'x' },
    { transactionId: 'a', amount: 0, transferContent: 'x' },
    { transactionId: 'a', amount: -5, transferContent: 'x' },
    { transactionId: 'a', amount: 1.5, transferContent: 'x' },
    { transactionId: 'a', amount: 1e21, transferContent: 'x' },
    { transactionId: 'a', amount: 1, transferContent: '' },
    { transactionId: 'x'.repeat(101), amount: 1, transferContent: 'x' },
    { transactionId: 'a', amount: 1, transferContent: 'x'.repeat(501) },
  ])('rejects %j', (payload) => {
    expect(() => parseBankTransfer(payload)).toThrow(BadRequestException);
  });
});

describe('buildQrImageUrl', () => {
  const account = {
    bankId: '970422',
    accountNo: '123456',
    accountName: 'SHANITY',
  };

  it('builds a vietqr.io image URL with amount and memo', () => {
    const url = new URL(buildQrImageUrl('vietqr', account, 499000, 'SHAN1'));
    expect(url.origin + url.pathname).toBe(
      'https://img.vietqr.io/image/970422-123456-compact2.png',
    );
    expect(url.searchParams.get('amount')).toBe('499000');
    expect(url.searchParams.get('addInfo')).toBe('SHAN1');
    expect(url.searchParams.get('accountName')).toBe('SHANITY');
  });

  it('builds a SePay image URL', () => {
    const url = new URL(buildQrImageUrl('sepay', account, 499000, 'SHAN1'));
    expect(url.origin + url.pathname).toBe('https://qr.sepay.vn/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      acc: '123456',
      bank: '970422',
      amount: '499000',
      des: 'SHAN1',
    });
  });
});

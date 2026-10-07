export type VietQrFormat = 'vietqr' | 'sepay';

export interface VietQrAccount {
  bankId: string;
  accountNo: string;
  accountName: string;
}

/**
 * Dynamic QR image URL. Both services render a standard VietQR (NAPAS 247)
 * code that pre-fills the amount and the transfer memo in the banking app.
 * - vietqr: https://img.vietqr.io image API
 * - sepay:  https://qr.sepay.vn image API (pairs with SePay webhooks)
 */
export function buildQrImageUrl(
  format: VietQrFormat,
  account: VietQrAccount,
  amount: number,
  memo: string,
) {
  if (format === 'sepay') {
    const query = new URLSearchParams({
      acc: account.accountNo,
      bank: account.bankId,
      amount: String(amount),
      des: memo,
    });
    return `https://qr.sepay.vn/img?${query}`;
  }
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: memo,
    accountName: account.accountName,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(account.bankId)}-${encodeURIComponent(account.accountNo)}-compact2.png?${query}`;
}

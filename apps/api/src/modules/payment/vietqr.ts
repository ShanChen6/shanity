import type { Order } from './entities/order.entity.js';
import { toTransferContent } from './order-snapshot.js';

/** Dynamic VietQR image for the frozen amount and the order's transfer memo. */
export function buildVietQrUrl(order: Pick<Order, 'code' | 'finalTotal'>) {
  const bank = process.env.VIETQR_BANK_ID ?? 'MB';
  const account = process.env.VIETQR_ACCOUNT_NO ?? '';
  const name = process.env.VIETQR_ACCOUNT_NAME ?? '';
  const query = new URLSearchParams({
    amount: String(order.finalTotal),
    addInfo: toTransferContent(order.code),
    accountName: name,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?${query}`;
}

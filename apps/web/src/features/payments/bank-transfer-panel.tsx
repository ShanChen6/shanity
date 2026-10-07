"use client";

import { QrCode } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { CopyField } from "./copy-field";
import { formatMoney, plainAmount } from "./format";
import type { CheckoutSession } from "./types";

/**
 * VietQR transfer screen: the dynamic QR already carries the amount and the
 * order code as the transfer memo; the fields below are the manual fallback.
 */
export function BankTransferPanel({ session }: { session: CheckoutSession }) {
  const [qrFailed, setQrFailed] = useState(false);
  const transfer = session.transfer;
  return (
    <section aria-labelledby="bank-transfer-title" className="space-y-4">
      <h2
        id="bank-transfer-title"
        className="font-heading text-h3 font-semibold"
      >
        Quét mã để chuyển khoản
      </h2>

      <div className="flex justify-center rounded-lg border border-border bg-white p-3">
        {session.qrCodeUrl && !qrFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- third-party QR image, dynamic per order
          <img
            src={session.qrCodeUrl}
            alt={`Mã QR chuyển khoản ${formatMoney(session.amount, session.currency)} với nội dung ${session.orderCode}`}
            width={280}
            height={280}
            className="size-64 object-contain sm:size-72"
            onError={() => setQrFailed(true)}
          />
        ) : (
          <div className="flex size-64 flex-col items-center justify-center gap-2 text-center text-body-sm text-muted sm:size-72">
            <QrCode aria-hidden size={40} />
            Không tải được mã QR. Hãy chuyển khoản thủ công theo thông tin bên
            dưới.
          </div>
        )}
      </div>

      {transfer && (
        <div className="space-y-2">
          <CopyField
            label="Số tài khoản"
            value={transfer.accountNo}
            display={`${transfer.accountNo} · ${transfer.bankName}`}
          />
          {transfer.accountName && (
            <CopyField label="Chủ tài khoản" value={transfer.accountName} />
          )}
          <CopyField
            label="Số tiền"
            value={plainAmount(transfer.amount, session.currency)}
            display={formatMoney(transfer.amount, session.currency)}
            emphasize
          />
          <CopyField
            label="Nội dung chuyển khoản"
            value={transfer.content}
            emphasize
          />
        </div>
      )}

      <Alert tone="warning" title="Giữ nguyên số tiền và nội dung chuyển khoản">
        Hệ thống dựa vào nội dung để nhận diện đơn hàng. Chuyển sai nội dung
        hoặc thiếu tiền sẽ không được tự động xác nhận.
      </Alert>

      <p
        role="status"
        className="flex items-center gap-2 rounded-md bg-info-background px-3 py-2.5 text-body-sm text-info-foreground"
      >
        <Spinner decorative />
        Hệ thống đang chờ ngân hàng xác nhận giao dịch…
      </p>
      <p className="text-caption text-muted">
        Bạn có thể đóng trang này sau khi chuyển khoản: khóa học sẽ tự động mở
        ngay khi ngân hàng báo tiền về, và đơn nằm trong mục “Đơn hàng của tôi”.
      </p>
    </section>
  );
}

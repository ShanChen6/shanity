"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminFeedback } from "@/features/admin/admin-feedback";
import { formatMoney } from "./format";
import { useOrderMutations } from "./hooks";
import { adminOrderErrorMessage, minorUnitName } from "./order-model";
import type { AdminOrderDetail, RefundResult } from "./types";
import {
  justificationError,
  parseAmount,
  refundAmountError,
} from "./validation";

const MODE_TEXT = {
  PROVIDER_API: "Đã hoàn qua cổng thanh toán",
  INTERNAL: "Ghi nhận hoàn tiền nội bộ — cần chuyển khoản thủ công",
} as const;

function Done({
  result,
  currency,
}: {
  result: RefundResult;
  currency: string;
}) {
  const { refund } = result;
  return (
    <div className="space-y-3">
      <Alert tone="success" title="Đã ghi nhận hoàn tiền">
        {formatMoney(refund.amount, currency)} ·{" "}
        {refund.status === "REFUNDED"
          ? "Đã hoàn toàn bộ, đơn hàng chuyển sang Đã hoàn tiền."
          : "Hoàn một phần, đơn hàng vẫn Hoàn tất."}
      </Alert>
      <Alert
        tone={refund.mode === "INTERNAL" ? "warning" : "info"}
        title={MODE_TEXT[refund.mode]}
      >
        Mã giao dịch hoàn:{" "}
        <span className="break-all font-mono text-xs">
          {refund.providerTransactionId}
        </span>
      </Alert>
      {refund.enrollmentsRevoked > 0 && (
        <p className="text-sm">
          Đã thu hồi quyền học của {refund.enrollmentsRevoked} khóa học.
        </p>
      )}
    </div>
  );
}

export function RefundModal({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrderDetail;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { refund } = useOrderMutations(order.id);
  const notify = useAdminFeedback();
  const { currency, refundableAmount } = order.summary;
  const [amount, setAmount] = useState(String(refundableAmount));
  const [reason, setReason] = useState("");
  const [notifyStudent, setNotifyStudent] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RefundResult | null>(null);

  const amountError = refundAmountError(amount, refundableAmount, currency);
  const reasonError = reason ? justificationError(reason, "Lý do") : null;
  const isFull = parseAmount(amount) === refundableAmount;
  const ready =
    !amountError && !justificationError(reason, "Lý do") && confirmed;
  const busy = refund.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = parseAmount(amount);
    if (!ready || busy || value === null) return;
    setError("");
    try {
      const done = await refund.mutateAsync({
        refundAmount: value,
        reason: reason.trim(),
        notifyStudent,
      });
      setResult(done);
      const message =
        done.refund.status === "REFUNDED"
          ? `Đã hoàn toàn bộ đơn ${order.code} và thu hồi quyền học.`
          : `Đã hoàn một phần đơn ${order.code}.`;
      onDone(message);
      notify(message);
    } catch (failure) {
      setError(adminOrderErrorMessage(failure));
    }
  }

  return (
    <Dialog
      title={`Hoàn tiền đơn ${order.code}`}
      description={`Có thể hoàn tối đa ${formatMoney(refundableAmount, currency)}`}
      side="center"
      className="max-w-xl!"
      busy={busy}
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-4">
          <Done result={result} currency={currency} />
          <div className="flex justify-end">
            <Button onClick={onClose}>Đóng</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="space-y-4"
        >
          <Alert tone="danger" title="Hoàn tiền không thể hoàn tác">
            Hoàn toàn bộ số tiền còn lại sẽ thu hồi quyền truy cập khóa học của
            học viên. Hoàn một phần giữ nguyên quyền học. Hành động được ghi
            vĩnh viễn vào nhật ký kiểm toán cùng danh tính và địa chỉ IP của
            bạn.
          </Alert>
          <FormField
            label={`Số tiền hoàn (${minorUnitName(currency)})`}
            description={
              isFull && !amountError
                ? "Đây là hoàn toàn bộ: quyền học sẽ bị thu hồi."
                : `Từ 1 đến ${formatMoney(refundableAmount, currency)}.`
            }
            error={amountError ?? undefined}
          >
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  inputMode="numeric"
                  value={amount}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) =>
                    setAmount(
                      event.target.value.replace(/\D/g, "").slice(0, 15),
                    )
                  }
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={busy}
                  onClick={() => setAmount(String(refundableAmount))}
                >
                  Hoàn toàn bộ
                </Button>
              </div>
            )}
          </FormField>
          <FormField
            label="Lý do hoàn tiền"
            description="Tối thiểu 10 ký tự. Nội dung được lưu vào nhật ký kiểm toán."
            error={reasonError ?? undefined}
          >
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FormField>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={notifyStudent}
              disabled={busy}
              onChange={(event) => setNotifyStudent(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Thông báo hoàn tiền cho học viên (chưa có kênh email: yêu cầu chỉ
              được ghi vào nhật ký)
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>Tôi xác nhận số tiền và lý do hoàn tiền là chính xác</span>
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!ready}
              loading={busy}
              loadingLabel="Đang hoàn tiền…"
            >
              Xác nhận hoàn tiền
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

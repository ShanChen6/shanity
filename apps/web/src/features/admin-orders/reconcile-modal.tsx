"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAdminFeedback } from "@/features/admin/admin-feedback";
import { formatMoney } from "./format";
import { useOrderMutations } from "./hooks";
import {
  adminOrderErrorMessage,
  isPaymentChannel,
  minorUnitName,
  PROVIDER_LABELS,
  RECONCILE_CHANNELS,
} from "./order-model";
import { ProofField, type ChosenProof } from "./proof-field";
import { ReconcileDone } from "./reconcile-done";
import type {
  AdminOrderDetail,
  PaymentChannel,
  ReconcileResult,
} from "./types";
import {
  justificationError,
  parseAmount,
  proofFileError,
  receivedAmountError,
  transactionIdError,
} from "./validation";

export function ReconcileModal({
  order,
  onClose,
  onDone,
}: {
  order: AdminOrderDetail;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { reconcile, upload } = useOrderMutations(order.id);
  const notify = useAdminFeedback();
  const { currency, finalTotal } = order.summary;
  const [txn, setTxn] = useState("");
  const [amount, setAmount] = useState(String(finalTotal));
  const [provider, setProvider] = useState<PaymentChannel>(
    isPaymentChannel(order.provider) ? order.provider : "VIETQR",
  );
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<ChosenProof | null>(null);
  const [proofError, setProofError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const txnError = txn ? transactionIdError(txn) : null;
  const amountError = receivedAmountError(amount, finalTotal, currency);
  const noteError = note ? justificationError(note, "Ghi chú") : null;
  const busy = reconcile.isPending || upload.isPending;
  const ready =
    !transactionIdError(txn) &&
    !amountError &&
    !justificationError(note, "Ghi chú") &&
    proof !== null &&
    confirmed;

  async function choose(file: File) {
    const problem = proofFileError(file);
    setProof(null);
    setProofError(problem ?? "");
    if (problem) return;
    try {
      const uploaded = await upload.mutateAsync(file);
      setProof({ file, proofImageUrl: uploaded.proofImageUrl });
    } catch (reason) {
      setProofError(adminOrderErrorMessage(reason));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const received = parseAmount(amount);
    if (!ready || busy || received === null || !proof) return;
    setError("");
    try {
      const done = await reconcile.mutateAsync({
        providerTransactionId: txn.trim(),
        amountReceived: received,
        provider,
        note: note.trim(),
        proofImageUrl: proof.proofImageUrl,
      });
      setResult(done);
      const message = done.enrollmentGranted
        ? `Đã đối soát đơn ${order.code} và cấp quyền học.`
        : `Đã đối soát đơn ${order.code}. Quyền học sẽ được cấp lại tự động.`;
      onDone(message);
      notify(message);
    } catch (reason) {
      setError(adminOrderErrorMessage(reason));
    }
  }

  return (
    <Dialog
      title={`Đối soát thủ công đơn ${order.code}`}
      description={`${order.student.displayName} · ${formatMoney(finalTotal, currency)}`}
      side="center"
      className="max-w-xl!"
      busy={busy}
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-4">
          <ReconcileDone result={result} />
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
          <Alert tone="danger" title="Thao tác không thể hoàn tác">
            Xác nhận đơn đã thanh toán sẽ cấp khóa học cho học viên ngay lập
            tức. Chỉ có thể đảo ngược bằng cách hoàn tiền. Hành động được ghi
            vĩnh viễn vào nhật ký kiểm toán cùng danh tính và địa chỉ IP của
            bạn.
          </Alert>
          <FormField
            label="Mã giao dịch ngân hàng"
            description="Mã tham chiếu thật trên sao kê, 4–100 ký tự."
            error={txnError ?? undefined}
          >
            {(props) => (
              <Input
                {...props}
                value={txn}
                maxLength={100}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setTxn(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label={`Số tiền đã nhận (${minorUnitName(currency)})`}
            description={`Tối thiểu bằng tổng đơn hàng ${formatMoney(finalTotal, currency)}.`}
            error={amountError ?? undefined}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={amount}
                autoComplete="off"
                disabled={busy}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/\D/g, "").slice(0, 15))
                }
              />
            )}
          </FormField>
          <FormField label="Kênh học viên đã thanh toán">
            {(props) => (
              <Select
                {...props}
                value={provider}
                disabled={busy}
                onChange={(event) =>
                  setProvider(event.target.value as PaymentChannel)
                }
              >
                {RECONCILE_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {PROVIDER_LABELS[channel]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField
            label="Lý do / ghi chú đối soát"
            description="Tối thiểu 10 ký tự. Nội dung được lưu vào nhật ký kiểm toán."
            error={noteError ?? undefined}
          >
            {(props) => (
              <Textarea
                {...props}
                value={note}
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </FormField>
          <ProofField
            proof={proof}
            uploading={upload.isPending}
            error={proofError}
            disabled={reconcile.isPending}
            onSelect={(file) => void choose(file)}
            onClear={() => setProof(null)}
          />
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>Tôi xác nhận đã kiểm tra sao kê ngân hàng</span>
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={!ready || upload.isPending}
              loading={reconcile.isPending}
              loadingLabel="Đang đối soát…"
            >
              Xác nhận đối soát
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

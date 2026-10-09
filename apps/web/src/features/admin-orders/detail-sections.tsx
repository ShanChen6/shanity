import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney, formatTimestamp } from "./format";
import { EnrollmentBadge, ProviderBadge } from "./order-badges";
import { JsonBlock } from "./json-block";
import { LEDGER_STATUS_LABELS, REFUND_STATUS_LABELS } from "./order-model";
import type { AdminOrderDetail, LedgerEntry } from "./types";

export function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-5">
      <h3 id={id} className="font-heading text-h4 font-semibold">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm tabular-nums [overflow-wrap:anywhere]",
          strong && "font-semibold",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function StudentSection({ order }: { order: AdminOrderDetail }) {
  return (
    <DetailSection id="order-student" title="Học viên">
      <dl className="divide-y divide-border">
        <Row label="Họ tên">{order.student.displayName}</Row>
        <Row label="Email">
          <span className="break-all">{order.student.email}</span>
        </Row>
        <Row label="Mã học viên">
          <span className="break-all font-mono text-xs">
            {order.student.id}
          </span>
        </Row>
      </dl>
    </DetailSection>
  );
}

export function ItemsSection({ order }: { order: AdminOrderDetail }) {
  return (
    <DetailSection id="order-items" title="Khóa học">
      <ul className="space-y-3">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {item.title}
              </p>
              <EnrollmentBadge state={item.enrollment} />
            </div>
            <dl className="mt-2 divide-y divide-border">
              <Row label="Đơn giá">
                {formatMoney(item.unitPrice, item.currency)}
              </Row>
              <Row label="Giảm giá">
                {formatMoney(item.discount, item.currency)}
              </Row>
              <Row label="Thành tiền" strong>
                {formatMoney(item.finalPrice, item.currency)}
              </Row>
            </dl>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}

export function SummarySection({ order }: { order: AdminOrderDetail }) {
  const { summary } = order;
  const money = (amount: number) => formatMoney(amount, summary.currency);
  return (
    <DetailSection id="order-summary" title="Tóm tắt tài chính">
      <dl className="divide-y divide-border">
        <Row label="Tạm tính">{money(summary.subtotal)}</Row>
        <Row label="Giảm giá">{money(summary.discountTotal)}</Row>
        <Row label="Tổng thanh toán" strong>
          {money(summary.finalTotal)}
        </Row>
        <Row label="Tiền tệ">{summary.currency}</Row>
        <Row label="Đã thanh toán">{money(summary.paidAmount)}</Row>
        <Row label="Đã hoàn">{money(summary.refundedAmount)}</Row>
        <Row label="Có thể hoàn" strong>
          {money(summary.refundableAmount)}
        </Row>
        <Row label="Trạng thái hoàn tiền">
          {REFUND_STATUS_LABELS[summary.refundStatus]}
        </Row>
      </dl>
    </DetailSection>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProviderBadge provider={entry.provider} />
          <Badge tone={entry.status === "FAILED" ? "danger" : "neutral"}>
            {LEDGER_STATUS_LABELS[entry.status]}
          </Badge>
        </div>
        <p className="font-semibold tabular-nums">
          {formatMoney(entry.amount, entry.currency)}
        </p>
      </div>
      <dl className="mt-2 divide-y divide-border">
        <Row label="Mã giao dịch">
          {entry.providerTransactionId ? (
            <span className="break-all font-mono text-xs">
              {entry.providerTransactionId}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Thời gian">{formatTimestamp(entry.receivedAt)}</Row>
        {entry.feeAmount > 0 && (
          <Row label="Phí">{formatMoney(entry.feeAmount, entry.currency)}</Row>
        )}
        {entry.transferContent && (
          <Row label="Nội dung chuyển khoản">{entry.transferContent}</Row>
        )}
      </dl>
      <JsonBlock value={entry.rawPayload} summary="Dữ liệu gốc (raw payload)" />
    </li>
  );
}

export function LedgerSection({ order }: { order: AdminOrderDetail }) {
  return (
    <DetailSection id="order-ledger" title="Giao dịch">
      {order.transactions.length === 0 ? (
        <p className="text-sm text-muted">Chưa có giao dịch nào.</p>
      ) : (
        <ul className="space-y-3">
          {order.transactions.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

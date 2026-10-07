"use client";

import { Clock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "./copy-field";
import { formatCountdown, formatDateTime, formatMoney } from "./format";
import { OrderStatusBadge } from "./status-badge";
import type { OrderStatus, StudentOrder } from "./types";
import { useCountdown } from "./use-countdown";

/** Frozen order data: titles and prices as agreed at checkout. */
export function OrderSummary({
  order,
  status,
  expiresAt,
  clockOffsetMs,
  showCountdown,
}: {
  order: StudentOrder;
  status: OrderStatus;
  expiresAt: string;
  clockOffsetMs: number;
  showCountdown: boolean;
}) {
  const countdown = useCountdown(
    showCountdown ? expiresAt : null,
    clockOffsetMs,
  );
  return (
    <Card aria-labelledby="order-summary-title">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="order-summary-title">Thông tin đơn hàng</CardTitle>
          <OrderStatusBadge status={status} />
        </div>
      </CardHeader>

      <ul className="divide-y divide-border border-y border-border">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-4 py-3"
          >
            <span className="min-w-0 break-words text-body-sm font-medium">
              {item.courseTitleSnapshot}
            </span>
            <span className="shrink-0 text-body-sm font-semibold tabular-nums">
              {formatMoney(item.finalPriceSnapshot, item.currency)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 text-body-sm">
        {order.discountTotal > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Tạm tính</dt>
              <dd className="tabular-nums">
                {formatMoney(order.subtotal, order.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Giảm giá</dt>
              <dd className="tabular-nums text-success-foreground">
                −{formatMoney(order.discountTotal, order.currency)}
              </dd>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-4 pt-1">
          <dt className="font-semibold">Tổng thanh toán</dt>
          <dd
            data-testid="order-total"
            className="font-heading text-h3 font-semibold tabular-nums text-primary"
          >
            {formatMoney(order.finalTotal, order.currency)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-3">
        <CopyField label="Mã đơn hàng" value={order.code} />
        <p className="flex items-center justify-between gap-3 text-body-sm text-muted">
          <span>Tạo lúc {formatDateTime(order.createdAt)}</span>
          {showCountdown && (
            <span
              role="timer"
              aria-label="Thời gian còn lại để thanh toán"
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-body-sm font-semibold ${
                countdown.remainingMs < 60_000
                  ? "bg-danger-background text-danger-foreground"
                  : "bg-warning-background text-warning-foreground"
              }`}
            >
              <Clock aria-hidden size={14} />
              {formatCountdown(countdown.remainingMs)}
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}

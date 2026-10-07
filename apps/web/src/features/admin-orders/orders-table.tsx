"use client";

import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney } from "./format";
import type { SortField, SortOrder } from "./filters";
import { OrderStatusBadge, ProviderBadge } from "./order-badges";
import type { AdminOrderListItem } from "./types";

type Column = { label: string; sort?: SortField; align?: "right" };
const COLUMNS: Column[] = [
  { label: "Mã đơn", sort: "code" },
  { label: "Học viên", sort: "studentName" },
  { label: "Khóa học" },
  { label: "Tổng thanh toán", sort: "finalTotal" },
  { label: "Nhà cung cấp" },
  { label: "Trạng thái", sort: "status" },
  { label: "Ngày tạo", sort: "createdAt" },
  { label: "Thao tác", align: "right" },
];

function SortHeader({
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  column: Column;
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const field = column.sort;
  const active = field === sortBy;
  const ariaSort = !field
    ? undefined
    : active
      ? sortOrder === "asc"
        ? "ascending"
        : "descending"
      : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-4 py-3 font-semibold ${column.align === "right" ? "text-right" : ""}`}
    >
      {field ? (
        <button
          type="button"
          onClick={() => onSort(field)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md uppercase hover:text-foreground focus-visible:outline-2"
        >
          {column.label}
          <span aria-hidden="true" className={active ? "" : "opacity-40"}>
            {active ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      ) : (
        column.label
      )}
    </th>
  );
}

/** Small note under the total when money has gone back to the student. */
function RefundHint({ order }: { order: AdminOrderListItem }) {
  if (order.refundedAmount <= 0) return null;
  const full =
    order.status === "REFUNDED" || order.refundedAmount >= order.paidAmount;
  return (
    <p className="mt-0.5 text-xs text-muted">
      {full ? "Đã hoàn " : "Hoàn một phần "}
      {formatMoney(order.refundedAmount, order.currency)}
    </p>
  );
}

function CourseCell({ order }: { order: AdminOrderListItem }) {
  const [first, ...rest] = order.courses;
  if (!first) return <span className="text-muted">—</span>;
  return (
    <div title={order.courses.map((course) => course.title).join("\n")}>
      <p className="line-clamp-2 [overflow-wrap:anywhere]">{first.title}</p>
      {rest.length > 0 && (
        <p className="text-xs text-muted">+{rest.length} khóa khác</p>
      )}
    </div>
  );
}

export function OrdersTable({
  items,
  sortBy,
  sortOrder,
  onSort,
  onOpen,
}: {
  items: AdminOrderListItem[];
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onOpen: (order: AdminOrderListItem) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Bảng đơn hàng, cuộn ngang để xem đầy đủ"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
    >
      <table className="w-full min-w-[64rem] text-left text-sm">
        <caption className="sr-only">Danh sách đơn hàng</caption>
        <thead className="border-b border-border bg-surface-secondary/60 text-xs uppercase tracking-wide text-muted">
          <tr>
            {COLUMNS.map((column) => (
              <SortHeader
                key={column.label}
                column={column}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((order) => (
            <tr key={order.id} className="align-top">
              <td className="px-4 py-3 font-mono text-xs [overflow-wrap:anywhere]">
                {order.code}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium [overflow-wrap:anywhere]">
                  {order.student.displayName}
                </p>
                <p className="break-all text-xs text-muted">
                  {order.student.email}
                </p>
              </td>
              <td className="max-w-64 px-4 py-3">
                <CourseCell order={order} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                <p className="font-semibold">
                  {formatMoney(order.finalTotal, order.currency)}
                </p>
                <RefundHint order={order} />
              </td>
              <td className="px-4 py-3">
                <ProviderBadge provider={order.provider} />
              </td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatDateTime(order.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Xem chi tiết đơn ${order.code}`}
                  onClick={() => onOpen(order)}
                >
                  Chi tiết
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

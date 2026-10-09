"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { useSession } from "@/features/auth/session-provider";
import { cn } from "@/lib/utils";
import { fetchStudentOrders, paymentKeys } from "./api";
import { useNow } from "./use-now";
import { formatDateTime, formatMoney } from "./format";
import {
  FILTERS,
  paymentErrorMessage,
  parseFilter,
  parsePage,
  providerLabel,
} from "./order-model";
import { OrderStatusBadge } from "./status-badge";
import type { OrderListFilter, StudentOrder } from "./types";

const EMPTY_COPY: Record<
  OrderListFilter,
  { title: string; description: string }
> = {
  all: {
    title: "Bạn chưa có đơn hàng nào",
    description: "Khi bạn mua một khóa học, đơn hàng sẽ xuất hiện ở đây.",
  },
  pending: {
    title: "Không có đơn nào đang chờ thanh toán",
    description: "Các đơn chưa thanh toán và chưa hết hạn sẽ hiện ở đây.",
  },
  completed: {
    title: "Chưa có đơn hoàn tất",
    description: "Đơn đã thanh toán thành công sẽ hiện ở đây.",
  },
  cancelled: {
    title: "Không có đơn bị hủy hoặc hết hạn",
    description: "Đơn đã hủy hoặc quá hạn thanh toán sẽ hiện ở đây.",
  },
};

/** Pending, unexpired, as of now (the list may have been fetched a while ago). */
export const isResumable = (order: StudentOrder, now: number) =>
  order.canResume && new Date(order.expiresAt).getTime() > now;

function courseNames(order: StudentOrder) {
  return order.items.map((item) => item.courseTitleSnapshot).join(", ");
}

function OrderActions({ order, now }: { order: StudentOrder; now: number }) {
  const slug = order.items[0]?.courseSlug;
  const className =
    "inline-flex min-h-9 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors";
  if (isResumable(order, now))
    return (
      <Link
        href={`/checkout/${order.code}`}
        className={cn(
          className,
          "bg-primary text-primary-foreground hover:bg-primary-hover",
        )}
      >
        Thanh toán ngay
      </Link>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.status === "COMPLETED" && slug && (
        <Link
          href={`/learn/${encodeURIComponent(slug)}`}
          className={cn(
            className,
            "bg-primary text-primary-foreground hover:bg-primary-hover",
          )}
        >
          Vào học
        </Link>
      )}
      <Link
        href={`/checkout/${order.code}`}
        className={cn(
          className,
          "border border-border-strong hover:bg-surface-hover",
        )}
      >
        Chi tiết
      </Link>
    </div>
  );
}

export function OrdersHistory() {
  const { user } = useSession();
  // Re-evaluates "can still pay" as deadlines pass without refetching.
  const now = useNow(30_000);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseFilter(params.get("status"));
  const page = parsePage(params.get("page"));

  const query = useQuery({
    queryKey: [...paymentKeys.orders(filter, page), user?.id],
    queryFn: ({ signal }) => fetchStudentOrders(filter, page, signal),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    retry: false,
  });

  function go(next: { status?: OrderListFilter; page?: number }) {
    const search = new URLSearchParams(params.toString());
    const status = next.status ?? filter;
    const target = next.page ?? 1;
    if (status === "all") search.delete("status");
    else search.set("status", status);
    if (target === 1) search.delete("page");
    else search.set("page", String(target));
    const text = search.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  const data = query.data;
  return (
    <main className="container flex-1 py-8 sm:py-12">
      <p className="text-xs font-semibold tracking-widest text-primary">
        TÀI KHOẢN
      </p>
      <h1 className="mt-1 text-title font-semibold tracking-tight">
        Đơn hàng của tôi
      </h1>
      <p className="mt-2 max-w-2xl text-body-sm text-muted">
        Lịch sử mua khóa học. Giá và tên khóa học là thông tin tại thời điểm bạn
        đặt hàng.
      </p>

      <div
        role="tablist"
        aria-label="Lọc đơn hàng"
        className="mt-6 flex gap-1 overflow-x-auto border-b border-border"
      >
        {FILTERS.map((item) => (
          <button
            key={item.value}
            role="tab"
            id={`orders-tab-${item.value}`}
            type="button"
            aria-selected={filter === item.value}
            aria-controls="orders-panel"
            onClick={() => go({ status: item.value })}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              filter === item.value
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="mt-6"
        role="tabpanel"
        id="orders-panel"
        aria-labelledby={`orders-tab-${filter}`}
        aria-live="polite"
      >
        {query.isPending ? (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Đang tải đơn hàng"
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState
            title="Không thể tải đơn hàng"
            description={paymentErrorMessage(query.error)}
            action={
              <Button onClick={() => void query.refetch()}>Thử lại</Button>
            }
          />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={40} />}
            title={EMPTY_COPY[filter].title}
            description={EMPTY_COPY[filter].description}
            action={
              <Link
                href="/courses"
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Khám phá khóa học
              </Link>
            }
          />
        ) : (
          data && (
            <>
              {/* md+: table */}
              <div className="hidden md:block">
                <Table aria-label="Lịch sử đơn hàng">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã đơn</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Khóa học</TableHead>
                      <TableHead className="text-right">Tổng tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Mã giao dịch</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((order) => (
                      <TableRow key={order.orderId}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">
                          {order.code}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted">
                          {formatDateTime(order.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-64 break-words">
                          {courseNames(order)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {formatMoney(order.finalTotal, order.currency)}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted">
                          {order.providerTransactionId ?? "—"}
                        </TableCell>
                        <TableCell>
                          <OrderActions order={order} now={now} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* < md: cards */}
              <ul className="space-y-3 md:hidden" aria-label="Lịch sử đơn hàng">
                {data.data.map((order) => (
                  <li key={order.orderId}>
                    <Card className="space-y-3 !p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="break-all font-mono text-xs font-semibold">
                          {order.code}
                        </p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="break-words text-body-sm font-medium">
                        {courseNames(order)}
                      </p>
                      <dl className="grid grid-cols-2 gap-2 text-caption text-muted">
                        <div>
                          <dt>Ngày tạo</dt>
                          <dd className="text-foreground">
                            {formatDateTime(order.createdAt)}
                          </dd>
                        </div>
                        <div>
                          <dt>Tổng tiền</dt>
                          <dd className="font-semibold text-foreground tabular-nums">
                            {formatMoney(order.finalTotal, order.currency)}
                          </dd>
                        </div>
                        {order.providerTransactionId && (
                          <div className="col-span-2">
                            <dt>
                              Mã giao dịch ·{" "}
                              {providerLabel(order.paymentProvider)}
                            </dt>
                            <dd className="break-all font-mono text-foreground">
                              {order.providerTransactionId}
                            </dd>
                          </div>
                        )}
                      </dl>
                      <OrderActions order={order} now={now} />
                    </Card>
                  </li>
                ))}
              </ul>

              {data.totalPages > 1 && (
                <nav
                  aria-label="Phân trang"
                  className="mt-6 flex items-center justify-between gap-3"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => go({ page: page - 1 })}
                  >
                    Trang trước
                  </Button>
                  <span className="text-body-sm text-muted">
                    Trang {data.page} / {data.totalPages} · {data.total} đơn
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages}
                    onClick={() => go({ page: page + 1 })}
                  >
                    Trang sau
                  </Button>
                </nav>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}

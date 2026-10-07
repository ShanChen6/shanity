"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import {
  buildOrdersApiQuery,
  filterProblems,
  hasActiveFilters,
  nextSort,
} from "./filters";
import { useAdminOrders } from "./hooks";
import { adminOrderErrorMessage } from "./order-model";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { OrdersFilters } from "./orders-filters";
import { OrdersPagination } from "./orders-pagination";
import { OrdersTable } from "./orders-table";
import type { SortField } from "./filters";
import type { AdminOrderListItem } from "./types";
import { useOrderFilters } from "./use-order-filters";

function ListSkeleton() {
  return (
    <Card>
      <div
        className="space-y-4"
        role="status"
        aria-label="Đang tải danh sách đơn hàng"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-28 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-6 w-24 sm:block" />
            <Skeleton className="hidden h-6 w-20 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function OrdersView() {
  const { filters, update, clear } = useOrderFilters();
  const problems = filterProblems(filters);
  const invalid = Boolean(problems.dates || problems.amounts);
  const query = useAdminOrders(buildOrdersApiQuery(filters), !invalid);
  const [selected, setSelected] = useState<AdminOrderListItem | null>(null);
  const filtered = hasActiveFilters(filters);
  const data = query.data;

  function body() {
    if (invalid)
      return (
        <Card>
          <EmptyState
            icon={<Icon name="info" className="size-8" />}
            title="Bộ lọc chưa hợp lệ"
            description="Hãy sửa khoảng ngày hoặc khoảng số tiền để xem danh sách."
          />
        </Card>
      );
    if (query.isError)
      return (
        <ErrorState
          title="Không thể tải danh sách đơn hàng"
          description={adminOrderErrorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>Thử lại</Button>}
        />
      );
    if (!data) return <ListSkeleton />;
    if (data.items.length === 0)
      return (
        <Card>
          <EmptyState
            icon={<Icon name="receipt" className="size-8" />}
            title={
              data.page > 1
                ? "Trang này không còn kết quả"
                : filtered
                  ? "Không tìm thấy đơn hàng phù hợp"
                  : "Chưa có đơn hàng nào"
            }
            description={
              data.page > 1
                ? "Số trang có thể đã thay đổi. Quay về trang đầu để xem danh sách hiện tại."
                : filtered
                  ? "Thử từ khóa khác hoặc xóa bộ lọc để xem tất cả đơn hàng."
                  : "Đơn hàng sẽ xuất hiện khi học viên bắt đầu thanh toán."
            }
            action={
              data.page > 1 ? (
                <Button variant="outline" onClick={() => update({ page: 1 })}>
                  Về trang đầu
                </Button>
              ) : (
                filtered && (
                  <Button variant="outline" onClick={clear}>
                    Xóa bộ lọc
                  </Button>
                )
              )
            }
          />
        </Card>
      );
    return (
      <>
        <OrdersTable
          items={data.items}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          onSort={(field: SortField) => update(nextSort(filters, field))}
          onOpen={setSelected}
        />
        <OrdersPagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          totalPages={data.totalPages}
          shown={data.items.length}
          onPage={(page) => update({ page })}
          onLimit={(limit) => update({ limit })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <OrdersFilters
        filters={filters}
        problems={problems}
        onChange={update}
        onClear={clear}
      />
      <section aria-label="Kết quả đơn hàng" aria-busy={query.isFetching}>
        {query.isPlaceholderData && (
          <p role="status" className="mb-3 text-sm text-muted">
            Đang cập nhật danh sách…
          </p>
        )}
        {body()}
      </section>
      {selected && (
        <OrderDetailDrawer
          key={selected.id}
          orderId={selected.id}
          code={selected.code}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

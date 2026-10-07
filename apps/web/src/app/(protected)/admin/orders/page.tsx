import { Suspense } from "react";
import { requireAnyRole } from "@/lib/server-session";
import { ORDER_CONSOLE_ROLES } from "@/lib/admin-access";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/shared/loading-state";
import { OrdersView } from "@/features/admin-orders/orders-view";
export const metadata = { title: "Đơn hàng · Quản trị Shanity" };
export default async function AdminOrdersPage() {
  await requireAnyRole(ORDER_CONSOLE_ROLES);
  return (
    <>
      <PageHeader
        title="Đơn hàng"
        description="Tra cứu đơn hàng, đối soát thủ công và hoàn tiền. Mọi thao tác đều được ghi vào nhật ký kiểm toán."
      />
      <div className="mt-6">
        <Suspense
          fallback={<LoadingState label="Đang tải danh sách đơn hàng…" />}
        >
          <OrdersView />
        </Suspense>
      </div>
    </>
  );
}

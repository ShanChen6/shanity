"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { AuditLogList } from "./audit-log-list";
import {
  ItemsSection,
  LedgerSection,
  StudentSection,
  SummarySection,
} from "./detail-sections";
import { formatTimestamp } from "./format";
import { useAdminOrder } from "./hooks";
import { adminOrderErrorMessage } from "./order-model";
import { OrderStatusBadge, ProviderBadge } from "./order-badges";
import { OrderTimeline } from "./order-timeline";
import { ReconcileModal } from "./reconcile-modal";
import { RefundModal } from "./refund-modal";
import type { AdminOrderDetail } from "./types";

type ModalKind = "reconcile" | "refund";

function DrawerSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Đang tải đơn hàng">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function OrderActions({
  order,
  onOpen,
}: {
  order: AdminOrderDetail;
  onOpen: (modal: ModalKind) => void;
}) {
  const { canReconcile, canRefund } = order.actions;
  if (!canReconcile && !canRefund)
    return (
      <p className="text-sm text-muted">
        Đơn hàng ở trạng thái này không có thao tác khả dụng.
      </p>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {canReconcile && (
        <Button onClick={() => onOpen("reconcile")}>Đối soát thủ công</Button>
      )}
      {canRefund && (
        <Button variant="outline" onClick={() => onOpen("refund")}>
          Hoàn tiền
        </Button>
      )}
    </div>
  );
}

export function OrderDetailDrawer({
  orderId,
  code,
  onClose,
}: {
  orderId: string;
  code: string;
  onClose: () => void;
}) {
  const query = useAdminOrder(orderId);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [notice, setNotice] = useState("");
  const order = query.data;

  return (
    <>
      <Dialog
        title={`Đơn hàng ${code}`}
        description="Việc mở màn hình này được ghi vào nhật ký kiểm toán."
        side="right"
        className="max-w-2xl!"
        onClose={onClose}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {order && (
                <>
                  <OrderStatusBadge status={order.status} />
                  <ProviderBadge provider={order.provider} />
                </>
              )}
            </div>
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </div>
          {query.isPending && <DrawerSkeleton />}
          {query.isError && (
            <ErrorState
              title="Không thể tải đơn hàng"
              description={adminOrderErrorMessage(query.error)}
              action={
                <Button onClick={() => void query.refetch()}>Thử lại</Button>
              }
            />
          )}
          {order && (
            <>
              <p className="text-xs text-muted">
                Tạo lúc {formatTimestamp(order.createdAt)} · Hoàn tất lúc{" "}
                {formatTimestamp(order.completedAt)}
              </p>
              {notice && <Alert tone="success">{notice}</Alert>}
              <OrderActions order={order} onOpen={setModal} />
              <StudentSection order={order} />
              <ItemsSection order={order} />
              <SummarySection order={order} />
              <LedgerSection order={order} />
              <OrderTimeline
                events={order.timeline}
                currency={order.summary.currency}
              />
              <AuditLogList logs={order.auditLogs} />
            </>
          )}
        </div>
      </Dialog>
      {order && modal === "reconcile" && (
        <ReconcileModal
          order={order}
          onClose={() => setModal(null)}
          onDone={setNotice}
        />
      )}
      {order && modal === "refund" && (
        <RefundModal
          order={order}
          onClose={() => setModal(null)}
          onDone={setNotice}
        />
      )}
    </>
  );
}

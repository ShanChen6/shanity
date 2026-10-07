"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError } from "@/lib/api";
import {
  fetchOrder,
  fetchPaymentMethods,
  paymentKeys,
  startCheckout,
} from "./api";
import { BankTransferPanel } from "./bank-transfer-panel";
import {
  FailureResult,
  RefundedResult,
  SuccessResult,
} from "./checkout-result";
import { effectiveStatus, paymentErrorMessage } from "./order-model";
import { OrderSummary } from "./order-summary";
import { isSelectable, PaymentMethods } from "./payment-methods";
import type { CheckoutSession, PaymentProvider, StudentOrder } from "./types";
import { useOrderStatus } from "./use-order-status";

export function CheckoutSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      aria-busy="true"
      aria-label="Đang tải đơn hàng"
    >
      <Skeleton className="h-80" />
      <Skeleton className="h-96" />
    </div>
  );
}

/**
 * /checkout/[orderCode]: one page, several views driven by the live order
 * status: PENDING (pay), COMPLETED (success + confetti), EXPIRED/CANCELLED
 * (reason + retry), REFUNDED. The page keeps itself current by polling; the
 * student never has to refresh.
 */
export function CheckoutView({ orderCode }: { orderCode: string }) {
  const params = useSearchParams();
  const orderQuery = useQuery({
    queryKey: paymentKeys.order(orderCode),
    queryFn: ({ signal }) => fetchOrder(orderCode, signal),
    retry: false,
  });
  const order = orderQuery.data;

  // Poll while the order can still change (an expired one may yet be paid:
  // bank notifications can arrive late).
  const live = useOrderStatus(orderCode, {
    enabled: Boolean(
      order && !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status),
    ),
  });

  // The poll says paid: load the full order (transaction code, slugs).
  const { refetch } = orderQuery;
  useEffect(() => {
    if (live.isPaid && order && order.status !== "COMPLETED") void refetch();
  }, [live.isPaid, order, refetch]);

  if (orderQuery.isPending) return <CheckoutSkeleton />;
  if (orderQuery.isError || !order) {
    const missing =
      orderQuery.error instanceof ApiError && orderQuery.error.status === 404;
    return missing ? (
      <EmptyState
        title="Không tìm thấy đơn hàng"
        description="Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."
        action={
          <Link
            href="/account/orders"
            className="font-semibold text-primary hover:underline"
          >
            Xem đơn hàng của tôi
          </Link>
        }
      />
    ) : (
      <ErrorState
        title="Không thể tải đơn hàng"
        description={paymentErrorMessage(orderQuery.error)}
        action={
          <Button onClick={() => void orderQuery.refetch()}>Thử lại</Button>
        }
      />
    );
  }

  const status = live.isPaid
    ? "COMPLETED"
    : (live.status ??
      effectiveStatus(
        order.status,
        order.expiresAt,
        live.nowMs + live.clockOffsetMs,
      ));
  const expiresAt = live.snapshot?.expiresAt ?? order.expiresAt;

  if (status === "COMPLETED")
    return <SuccessResult order={{ ...order, status }} />;
  if (status === "REFUNDED") return <RefundedResult order={order} />;
  if (status === "EXPIRED" || status === "CANCELLED")
    return <FailureResult order={order} status={status} />;

  return (
    <PendingCheckout
      order={order}
      status={status}
      expiresAt={expiresAt}
      clockOffsetMs={live.clockOffsetMs}
      returnedFromGateway={params.get("checkout") === "success"}
      pollError={live.error}
      pollFatal={live.fatal}
      onCheckoutStarted={live.refetch}
    />
  );
}

function PendingCheckout({
  order,
  status,
  expiresAt,
  clockOffsetMs,
  returnedFromGateway,
  pollError,
  pollFatal,
  onCheckoutStarted,
}: {
  order: StudentOrder;
  status: StudentOrder["status"];
  expiresAt: string;
  clockOffsetMs: number;
  returnedFromGateway: boolean;
  pollError: string | null;
  pollFatal: boolean;
  onCheckoutStarted: () => void;
}) {
  const methods = useQuery({
    queryKey: paymentKeys.methods(order.currency),
    queryFn: ({ signal }) => fetchPaymentMethods(order.currency, signal),
    retry: false,
  });
  const [picked, setPicked] = useState<PaymentProvider | null>(null);
  const available = (methods.data ?? []).filter((method) =>
    isSelectable(method),
  );
  const remembered =
    order.paymentProvider &&
    available.some((method) => method.provider === order.paymentProvider)
      ? order.paymentProvider
      : null;
  const chosen = picked ?? remembered ?? available[0]?.provider ?? null;

  const checkout = useMutation({
    mutationFn: (provider: PaymentProvider) =>
      startCheckout(order.code, provider),
    onSuccess: (session: CheckoutSession) => {
      onCheckoutStarted();
      // Only ever leave for an https payment page.
      if (
        session.provider === "STRIPE" &&
        session.paymentUrl?.startsWith("https://")
      )
        window.location.assign(session.paymentUrl);
    },
  });

  // Bank transfer is a deterministic, idempotent QR: show it as soon as it is
  // the chosen method (also after a reload). Redirect gateways wait for a click.
  const autoStarted = useRef<string | null>(null);
  const { mutate } = checkout;
  useEffect(() => {
    if (chosen === "VIETQR" && autoStarted.current !== order.code) {
      autoStarted.current = order.code;
      mutate("VIETQR");
    }
  }, [chosen, order.code, mutate]);

  const session =
    checkout.data?.provider === chosen ? checkout.data : undefined;

  return (
    <div>
      <header className="mb-6">
        <p className="text-caption font-bold uppercase text-primary">
          Thanh toán
        </p>
        <h1 className="mt-1 font-heading text-h1 font-semibold">
          Hoàn tất đơn hàng
        </h1>
      </header>

      {returnedFromGateway && (
        <Alert tone="info" title="Đang xác nhận thanh toán" className="mb-4">
          Cảm ơn bạn đã thanh toán. Chúng tôi đang chờ cổng thanh toán xác nhận;
          trang sẽ tự cập nhật.
        </Alert>
      )}
      {pollFatal && (
        <Alert tone="error" className="mb-4">
          Không thể theo dõi trạng thái đơn hàng. Hãy tải lại trang.
        </Alert>
      )}
      {pollError && !pollFatal && (
        <Alert tone="warning" className="mb-4">
          Đang mất kết nối tới máy chủ — hệ thống sẽ tự thử lại.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <OrderSummary
          order={order}
          status={status}
          expiresAt={expiresAt}
          clockOffsetMs={clockOffsetMs}
          showCountdown
        />

        <Card className="space-y-5">
          {methods.isError ? (
            <ErrorState
              title="Không tải được phương thức thanh toán"
              description={paymentErrorMessage(methods.error)}
              action={
                <Button onClick={() => void methods.refetch()}>Thử lại</Button>
              }
            />
          ) : (
            <PaymentMethods
              methods={methods.data}
              loading={methods.isPending}
              value={chosen}
              onChange={setPicked}
              disabled={checkout.isPending}
            />
          )}

          {!methods.isPending && !methods.isError && available.length === 0 && (
            <Alert tone="warning">
              Hiện chưa có phương thức thanh toán nào khả dụng cho đơn hàng này.
              Vui lòng thử lại sau hoặc liên hệ hỗ trợ.
            </Alert>
          )}

          {checkout.isError && (
            <Alert tone="error">
              {paymentErrorMessage(checkout.error)}{" "}
              {chosen && (
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => checkout.mutate(chosen)}
                >
                  Thử lại
                </button>
              )}
            </Alert>
          )}

          {chosen === "VIETQR" && checkout.isPending && !session && (
            <Skeleton className="h-72" aria-label="Đang tạo mã QR" />
          )}
          {chosen === "VIETQR" && session && (
            <BankTransferPanel session={session} />
          )}

          {chosen === "STRIPE" && (
            <div className="space-y-3">
              <p className="text-body-sm text-foreground-secondary">
                Bạn sẽ được chuyển tới trang thanh toán bảo mật của Stripe. Sau
                khi thanh toán xong, bạn sẽ quay lại đây và khóa học tự động mở.
              </p>
              <Button
                size="lg"
                className="w-full"
                loading={checkout.isPending}
                loadingLabel="Đang chuyển tới Stripe…"
                onClick={() => checkout.mutate("STRIPE")}
              >
                <ExternalLink aria-hidden size={16} />
                Thanh toán với Stripe
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

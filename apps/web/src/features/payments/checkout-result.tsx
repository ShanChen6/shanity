"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createOrder } from "./api";
import { Confetti } from "./confetti";
import { formatDateTime, formatMoney } from "./format";
import { paymentErrorMessage, providerLabel } from "./order-model";
import type { OrderStatus, StudentOrder } from "./types";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

function learnHref(slug: string | null) {
  return slug ? `/learn/${encodeURIComponent(slug)}` : "/my-learning";
}

export function SuccessResult({ order }: { order: StudentOrder }) {
  const first = order.items[0];
  return (
    <>
      <Confetti />
      <Card className="border-success bg-success-background/40" role="status">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-background text-success-foreground">
            <CheckCircle2 aria-hidden size={32} />
          </span>
          <h1 className="font-heading text-h2 font-semibold text-success-foreground">
            Thanh toán thành công!
          </h1>
          <p className="max-w-md text-body text-foreground-secondary">
            Cảm ơn bạn. Khóa học đã được mở và sẵn sàng để bạn bắt đầu.
          </p>
          <Link
            href={learnHref(first?.courseSlug ?? null)}
            className="mt-1 inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Bắt đầu học ngay
          </Link>
          <Link
            href="/account/orders"
            className="text-body-sm font-semibold text-primary hover:underline"
          >
            Xem lịch sử đơn hàng
          </Link>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-heading text-h3 font-semibold">
          Chi tiết giao dịch
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-body-sm sm:grid-cols-2">
          <Detail label="Mã đơn hàng" value={order.code} mono />
          <Detail
            label="Mã giao dịch"
            value={order.providerTransactionId ?? "Đang cập nhật…"}
            mono
          />
          <Detail
            label="Số tiền"
            value={formatMoney(order.finalTotal, order.currency)}
          />
          <Detail
            label="Phương thức"
            value={providerLabel(order.paymentProvider)}
          />
        </dl>
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <span className="min-w-0 break-words text-body-sm font-medium">
                {item.courseTitleSnapshot}
              </span>
              <Link
                href={learnHref(item.courseSlug)}
                className="shrink-0 text-body-sm font-semibold text-primary hover:underline"
              >
                Vào học
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className={`break-all font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

const FAILURE_COPY: Partial<
  Record<OrderStatus, { title: string; reason: string }>
> = {
  EXPIRED: {
    title: "Đơn hàng đã hết hạn",
    reason:
      "Đơn hàng đã quá thời hạn thanh toán nên không còn hiệu lực. Bạn có thể tạo lại đơn để tiếp tục.",
  },
  CANCELLED: {
    title: "Đơn hàng đã bị hủy",
    reason:
      "Đơn hàng này đã được hủy (ví dụ khóa học không còn bán hoặc đã chuyển sang miễn phí).",
  },
};

/** FAILED / EXPIRED / CANCELLED: why it ended and what to do next. */
export function FailureResult({
  order,
  status,
}: {
  order: StudentOrder;
  status: "EXPIRED" | "CANCELLED";
}) {
  const router = useRouter();
  const copy = FAILURE_COPY[status]!;
  const retry = useMutation({
    mutationFn: () => createOrder(order.items.map((item) => item.courseId)),
    onSuccess: (next) => router.replace(`/checkout/${next.code}`),
  });
  return (
    <Card className="border-danger bg-danger-background/40" role="alert">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-background text-danger-foreground">
          <AlertTriangle aria-hidden size={30} />
        </span>
        <h1 className="font-heading text-h2 font-semibold text-danger-foreground">
          {copy.title}
        </h1>
        <p className="max-w-md text-body text-foreground-secondary">
          {copy.reason}
        </p>
        <p className="max-w-md rounded-md bg-warning-background px-3 py-2 text-body-sm text-warning-foreground">
          Nếu bạn đã chuyển khoản trước khi đơn hết hạn, đừng lo: hệ thống vẫn
          tự ghi nhận và mở khóa học khi ngân hàng xác nhận. Trang này sẽ tự cập
          nhật.
        </p>
        {retry.isError && (
          <Alert tone="error" className="w-full max-w-md text-left">
            {paymentErrorMessage(retry.error)}
          </Alert>
        )}
        <div className="mt-1 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            loading={retry.isPending}
            loadingLabel="Đang tạo đơn mới…"
            onClick={() => retry.mutate()}
          >
            Thử thanh toán lại
          </Button>
          {SUPPORT_EMAIL ? (
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Hỗ trợ đơn hàng ${order.code}`)}`}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-border-strong px-6 py-3 text-base font-semibold hover:bg-surface-hover"
            >
              Liên hệ hỗ trợ
            </a>
          ) : (
            <Link
              href="/account/orders"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-border-strong px-6 py-3 text-base font-semibold hover:bg-surface-hover"
            >
              Đơn hàng của tôi
            </Link>
          )}
        </div>
        <p className="text-caption text-muted">Mã đơn hàng: {order.code}</p>
      </div>
    </Card>
  );
}

export function RefundedResult({ order }: { order: StudentOrder }) {
  return (
    <Card role="status">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-info-background text-info-foreground">
          <Info aria-hidden size={30} />
        </span>
        <h1 className="font-heading text-h2 font-semibold">
          Đơn hàng đã được hoàn tiền
        </h1>
        <p className="max-w-md text-body text-foreground-secondary">
          Khoản {formatMoney(order.finalTotal, order.currency)} của đơn{" "}
          <span className="font-mono">{order.code}</span> đã được hoàn lại.
        </p>
        <Link
          href="/account/orders"
          className="text-body-sm font-semibold text-primary hover:underline"
        >
          Xem lịch sử đơn hàng
        </Link>
      </div>
      <p className="mt-4 text-center text-caption text-muted">
        Tạo lúc {formatDateTime(order.createdAt)}
      </p>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QueryBoundary } from "@/components/shared/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/session-provider";
import { fetchPaymentMethods, paymentKeys } from "@/features/payments/api";
import { providerLabel } from "@/features/payments/order-model";
import {
  SYSTEM_STATE_COPY,
  useSystemStatus,
} from "@/features/system-status/use-system-status";
import { API_URL } from "@/lib/api";

const time = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * /admin/settings. Read-only on purpose: every value is something the system
 * reports about itself, because the API has no editable settings to bind to.
 */
export function AdminSettings() {
  const { user } = useSession();
  const system = useSystemStatus();
  const methods = useQuery({
    queryKey: paymentKeys.methods("VND"),
    queryFn: ({ signal }) => fetchPaymentMethods("VND", signal),
  });
  const state = SYSTEM_STATE_COPY[system.state];

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Trạng thái hệ thống</CardTitle>
          <CardDescription>
            Máy chủ API và cơ sở dữ liệu, kiểm tra mỗi phút.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            role="status"
            className="inline-flex items-center gap-2 font-medium"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${state.dot}`}
            />
            {state.label}
          </p>
          <Button variant="outline" onClick={system.refetch}>
            Kiểm tra lại
          </Button>
        </div>
        <dl className="mt-4 grid gap-1 text-sm text-muted">
          <div className="flex gap-2">
            <dt>Máy chủ API:</dt>
            <dd className="break-all font-mono text-foreground">{API_URL}</dd>
          </div>
          {system.checkedAt && (
            <div className="flex gap-2">
              <dt>Kiểm tra lúc:</dt>
              <dd className="text-foreground">
                {time.format(system.checkedAt)}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cổng thanh toán</CardTitle>
          <CardDescription>
            Các phương thức học viên có thể dùng để thanh toán bằng VND.
          </CardDescription>
        </CardHeader>
        <QueryBoundary
          query={methods}
          errorTitle="Không tải được danh sách cổng thanh toán"
          loading={<Skeleton className="h-24 w-full" />}
          isEmpty={(list) => list.length === 0}
          empty={{ title: "Chưa có cổng thanh toán nào" }}
        >
          {(list) => (
            <ul className="divide-y divide-border">
              {list.map((method) => (
                <li
                  key={method.provider}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="font-medium">
                    {providerLabel(method.provider)}
                  </span>
                  {method.available && method.supportsCurrency ? (
                    <Badge tone="success">Sẵn sàng</Badge>
                  ) : method.registered ? (
                    <Badge tone="warning">Chưa cấu hình</Badge>
                  ) : (
                    <Badge tone="neutral">Chưa hỗ trợ</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
        <p className="mt-3 text-sm text-muted">
          Cổng thanh toán được bật bằng biến môi trường của máy chủ API.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phiên làm việc</CardTitle>
          <CardDescription>
            Tài khoản đang đăng nhập vào khu vực quản trị.
          </CardDescription>
        </CardHeader>
        <p className="break-all font-medium">{user?.email}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {user?.roles.map((role) => (
            <Badge key={role} tone="primary">
              {role}
            </Badge>
          ))}
        </div>
        <Link
          href="/profile"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
        >
          Quản lý hồ sơ & mật khẩu →
        </Link>
      </Card>
    </div>
  );
}

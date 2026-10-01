"use client";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { errorMessage } from "@/lib/api";
import { listUsers } from "./api";
import type { AdminUser } from "./types";

const roleLabels: Record<string, string> = {
  student: "Học sinh",
  instructor: "Giảng viên",
  admin: "Quản trị viên",
};
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: AdminUser[]; total: number };

export function UserTable() {
  const [state, setState] = useState<State>({ status: "loading" });
  const fetchUsers = useCallback(
    () =>
      listUsers()
        .then((response) =>
          setState({
            status: "success",
            items: response.items,
            total: response.total,
          }),
        )
        .catch((reason: unknown) =>
          setState({ status: "error", message: errorMessage(reason) }),
        ),
    [],
  );
  // Effects must not set state synchronously; the reload path below does that instead.
  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    void fetchUsers();
  }, [fetchUsers]);

  if (state.status === "loading") return <TableSkeleton />;
  if (state.status === "error")
    return (
      <ErrorState
        title="Không thể tải danh sách tài khoản"
        description={state.message}
        action={<Button onClick={retry}>Thử lại</Button>}
      />
    );
  if (state.items.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<Icon name="users" className="size-8" />}
          title="Chưa có tài khoản nào"
          description="Danh sách sẽ hiển thị khi có người dùng đăng ký."
        />
      </Card>
    );

  return (
    <div>
      <p className="mb-3 text-sm text-muted">Tổng {state.total} tài khoản.</p>
      {/* Desktop: full table. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Danh sách tài khoản</caption>
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                Người dùng
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Email
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Vai trò
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Trạng thái
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Ngày tạo
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {state.items.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.displayName} />
                    <span className="font-medium">{user.displayName}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-muted">{user.email}</td>
                <td className="px-5 py-3">
                  <RoleBadges roles={user.roles} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-5 py-3 text-muted">
                  {dateFormatter.format(new Date(user.createdAt))}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Sẽ được bổ sung ở giai đoạn tiếp theo"
                  >
                    Xem chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile/tablet: user cards instead of a cramped table. */}
      <ul className="space-y-3 md:hidden">
        {state.items.map((user) => (
          <li key={user.id}>
            <Card>
              <div className="flex items-start gap-3">
                <Avatar name={user.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{user.displayName}</p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <RoleBadges roles={user.roles} />
                    <StatusBadge status={user.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Tạo lúc {dateFormatter.format(new Date(user.createdAt))}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled
                title="Sẽ được bổ sung ở giai đoạn tiếp theo"
              >
                Xem chi tiết
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <Badge key={role} tone="secondary">
          {roleLabels[role] ?? role}
        </Badge>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === "active" ? "success" : "warning"}>
      {status === "active" ? "Hoạt động" : "Đã khóa"}
    </Badge>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <div
        className="space-y-4"
        role="status"
        aria-label="Đang tải danh sách tài khoản"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-6 w-20 sm:block" />
            <Skeleton className="hidden h-6 w-16 md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

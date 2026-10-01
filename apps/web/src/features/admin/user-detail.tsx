"use client";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ApiError, errorMessage } from "@/lib/api";
import { ChangeStatus } from "./change-status";
import { ChangeRole } from "./change-role";
import { getUser } from "./api";
import { RoleBadges, StatusBadge } from "./user-badges";
import type { AdminUser } from "./types";

type State =
  | { status: "loading" }
  | { status: "success"; user: AdminUser }
  | { status: "missing" }
  | { status: "error"; message: string; forbidden: boolean };
const dates = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function UserDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getUser(id)
      .then((user) => {
        if (active) setState({ status: "success", user });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404)
          setState({ status: "missing" });
        else
          setState({
            status: "error",
            message: errorMessage(error),
            forbidden: error instanceof ApiError && error.status === 403,
          });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  if (state.status === "loading")
    return (
      <Card role="status" aria-label="Đang tải thông tin người dùng">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="mt-4 h-6 w-1/2" />
        <Skeleton className="mt-4 h-32 w-full" />
      </Card>
    );
  if (state.status === "missing")
    return (
      <Card>
        <EmptyState
          title="Không tìm thấy người dùng"
          description="Tài khoản này không tồn tại hoặc đã bị xóa."
        />
      </Card>
    );
  if (state.status === "error")
    return (
      <ErrorState
        title={
          state.forbidden
            ? "Bạn không có quyền xem người dùng này"
            : "Không thể tải thông tin người dùng"
        }
        description={
          state.forbidden
            ? "Quyền quản trị của bạn có thể đã thay đổi."
            : state.message
        }
        action={
          !state.forbidden && (
            <Button
              onClick={() => {
                document
                  .getElementById("admin-content")
                  ?.focus({ preventScroll: true });
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Thử lại
            </Button>
          )
        }
      />
    );
  const { user } = state;
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={user.displayName} className="size-16 shrink-0" />
        <h2 className="min-w-0 [overflow-wrap:anywhere] font-heading text-h2 font-semibold">
          {user.displayName}
        </h2>
      </div>
      <dl className="mt-6 grid min-w-0 gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm text-muted">Email</dt>
          <dd className="mt-1 break-all">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Vai trò</dt>
          <dd className="mt-1">
            {user.roles.length ? (
              <RoleBadges roles={user.roles} />
            ) : (
              "Chưa có vai trò"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Trạng thái</dt>
          <dd className="mt-1">
            <StatusBadge status={user.status} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Ngày tạo (giờ Việt Nam)</dt>
          <dd className="mt-1">
            <time dateTime={user.createdAt}>
              {dates.format(new Date(user.createdAt))}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            Cập nhật lần cuối (giờ Việt Nam)
          </dt>
          <dd className="mt-1">
            <time dateTime={user.updatedAt}>
              {dates.format(new Date(user.updatedAt))}
            </time>
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-sm text-muted">Mã người dùng</dt>
          <dd className="mt-1 break-all font-mono text-sm">{user.id}</dd>
        </div>
      </dl>
      <ChangeStatus
        user={user}
        onChanged={(updated) => setState({ status: "success", user: updated })}
      />
      <ChangeRole
        user={user}
        onChanged={(updated) => setState({ status: "success", user: updated })}
      />
    </Card>
  );
}

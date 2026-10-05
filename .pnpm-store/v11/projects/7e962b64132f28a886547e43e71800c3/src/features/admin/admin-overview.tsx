"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { ApiError, errorMessage } from "@/lib/api";
import { getUserStatistics } from "./api";
import type { AdminUserStatistics } from "./types";

const metrics = [
  { key: "totalUsers", label: "Tổng người dùng" },
  { key: "students", label: "Học sinh" },
  { key: "instructors", label: "Giảng viên" },
  { key: "admins", label: "Quản trị viên" },
  { key: "activeUsers", label: "Người dùng hoạt động" },
] as const;
const numbers = new Intl.NumberFormat("vi-VN");
type State =
  | { status: "loading" }
  | { status: "success"; counts: AdminUserStatistics }
  | { status: "error"; message: string; forbidden: boolean };

export function AdminOverview() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getUserStatistics()
      .then((counts) => {
        if (active) setState({ status: "success", counts });
      })
      .catch((reason: unknown) => {
        if (active)
          setState({
            status: "error",
            message: errorMessage(reason),
            forbidden: reason instanceof ApiError && reason.status === 403,
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (state.status === "loading")
    return (
      <div
        role="status"
        aria-label="Đang tải thống kê người dùng"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map(({ key }) => (
          <Card key={key}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-4 h-9 w-1/2" />
          </Card>
        ))}
      </div>
    );
  if (state.status === "error")
    return (
      <ErrorState
        title={
          state.forbidden
            ? "Bạn không có quyền xem thống kê"
            : "Không thể tải thống kê người dùng"
        }
        description={state.message}
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
  return (
    <section aria-label="Thống kê người dùng">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ key, label }) => (
          <Card key={key}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-3 break-words text-3xl font-semibold tabular-nums">
              {numbers.format(state.counts[key])}
            </dd>
          </Card>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Số lượng theo vai trò gồm cả tài khoản đã khóa; một tài khoản có thể
        thuộc nhiều nhóm.
      </p>
    </section>
  );
}

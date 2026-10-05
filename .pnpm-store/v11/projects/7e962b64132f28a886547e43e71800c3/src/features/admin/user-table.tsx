"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { roleLabels, RoleBadges, StatusBadge } from "./user-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ApiError, errorMessage } from "@/lib/api";
import { listUsers } from "./api";
import type { AdminUserListResponse } from "./types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function UserTable({ query }: { query: string }) {
  const router = useRouter();
  const params = new URLSearchParams(query);
  const [pending, startTransition] = useTransition();
  const results = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const navigate = (href: string) => {
    if (pending) return;
    const next = new URLSearchParams(href.split("?")[1]);
    const same = ["page", "search", "role", "status"].every(
      (key) =>
        (next.get(key) || (key === "page" ? "1" : "")) ===
        (params.get(key) || (key === "page" ? "1" : "")),
    );
    if (same) {
      results.current?.focus();
      return;
    }
    focusRequested.current = true;
    startTransition(() => router.push(href, { scroll: false }));
  };
  const settled = useCallback(() => {
    if (focusRequested.current) {
      focusRequested.current = false;
      results.current?.focus({ preventScroll: true });
      results.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, []);
  return (
    <div className="space-y-5">
      <form
        key={query}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const name of ["search", "role", "status"]) {
            const value = String(data.get(name) ?? "").trim();
            if (value) next.set(name, value);
          }
          navigate(`/admin/users?${next}`);
        }}
      >
        <fieldset
          disabled={pending}
          className="flex min-w-0 flex-wrap items-end gap-3"
        >
          <legend className="sr-only">Tìm kiếm và lọc người dùng</legend>
          <label className="min-w-48 flex-1 space-y-1 text-sm">
            <span>Tìm theo tên hoặc email</span>
            <Input
              name="search"
              type="search"
              maxLength={254}
              defaultValue={params.get("search") ?? ""}
              placeholder="Nhập tên hoặc email"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Vai trò</span>
            <Select name="role" defaultValue={params.get("role") ?? ""}>
              <option value="">Tất cả vai trò</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Trạng thái</span>
            <Select name="status" defaultValue={params.get("status") ?? ""}>
              <option value="">Tất cả trạng thái</option>
              <option value="active">Hoạt động</option>
              <option value="disabled">Đã khóa</option>
            </Select>
          </label>
          <Button type="submit" loading={pending} loadingLabel="Đang áp dụng…">
            Áp dụng
          </Button>
          <Link
            href="/admin/users"
            onNavigate={(event) => {
              event.preventDefault();
              navigate("/admin/users");
            }}
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-primary hover:underline"
          >
            Xóa bộ lọc
          </Link>
        </fieldset>
      </form>
      <div
        ref={results}
        id="admin-user-results"
        role="region"
        tabIndex={-1}
        aria-label="Kết quả người dùng"
        aria-busy={pending}
        className="scroll-mt-4 rounded-md"
      >
        {pending && (
          <p role="status" className="mb-3 text-sm text-muted">
            Đang cập nhật danh sách…
          </p>
        )}
        <UserResults
          key={query}
          query={query}
          onNavigate={navigate}
          onSettled={settled}
        />
      </div>
    </div>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string; forbidden: boolean }
  | ({ status: "success" } & AdminUserListResponse);

function UserResults({
  query,
  onNavigate,
  onSettled,
}: {
  query: string;
  onNavigate: (href: string) => void;
  onSettled: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void listUsers(query)
      .then((response) => {
        if (active) setState({ ...response, status: "success" });
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
  }, [query, attempt]);
  useEffect(() => {
    if (state.status !== "loading") onSettled();
  }, [state.status, onSettled]);
  const retry = useCallback(() => {
    document
      .getElementById("admin-user-results")
      ?.focus({ preventScroll: true });
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (state.status === "loading") return <TableSkeleton />;
  if (state.status === "error")
    return (
      <ErrorState
        title={
          state.forbidden
            ? "Bạn không có quyền xem danh sách tài khoản"
            : "Không thể tải danh sách tài khoản"
        }
        description={state.message}
        action={!state.forbidden && <Button onClick={retry}>Thử lại</Button>}
      />
    );
  const filtered = ["search", "role", "status"].some((key) =>
    new URLSearchParams(query).has(key),
  );
  const pagination = (position: string) => (
    <UserPagination
      query={query}
      page={state.page}
      totalPages={state.totalPages}
      position={position}
      onNavigate={onNavigate}
    />
  );
  if (state.items.length === 0) {
    const beyondLastPage = state.page > 1;
    const href = beyondLastPage
      ? `/admin/users?${firstPage(query)}`
      : "/admin/users";
    return (
      <Card>
        <EmptyState
          icon={<Icon name="users" className="size-8" />}
          title={
            beyondLastPage
              ? "Trang này không còn kết quả"
              : filtered
                ? "Không tìm thấy tài khoản phù hợp"
                : "Chưa có tài khoản nào"
          }
          description={
            beyondLastPage
              ? "Số trang có thể đã thay đổi. Quay về trang đầu để xem danh sách hiện tại."
              : filtered
                ? "Thử từ khóa khác hoặc xóa bộ lọc để xem tất cả tài khoản."
                : "Danh sách sẽ xuất hiện khi có tài khoản trong hệ thống."
          }
          action={
            (beyondLastPage || filtered) && (
              <Link
                href={href}
                onNavigate={(event) => {
                  event.preventDefault();
                  onNavigate(href);
                }}
                className="inline-flex min-h-11 items-center rounded-md px-3 text-primary hover:underline"
              >
                {beyondLastPage ? "Về trang đầu" : "Xóa bộ lọc"}
              </Link>
            )
          }
        />
      </Card>
    );
  }
  const first = (state.page - 1) * state.limit + 1;
  const last = first + state.items.length - 1;
  return (
    <div>
      <p aria-live="polite" className="mb-3 text-sm text-muted">
        Hiển thị {first}–{last} trong {state.total} tài khoản.
      </p>
      {pagination("đầu danh sách")}
      {/* Desktop: full table. */}
      <div
        role="region"
        aria-label="Bảng người dùng, cuộn ngang để xem đầy đủ"
        tabIndex={0}
        className="relative hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-sm md:block"
      >
        <table className="w-full min-w-[60rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[25%]" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
          </colgroup>
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
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {state.items.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.displayName} />
                    <span className="min-w-0 [overflow-wrap:anywhere] font-medium">
                      {user.displayName}
                    </span>
                  </div>
                </td>
                <td className="break-all px-5 py-3 text-muted">{user.email}</td>
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
                  <Link
                    href={`/admin/users/${user.id}?${query}`}
                    className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold text-primary hover:underline"
                    aria-label={`Xem chi tiết ${user.displayName}`}
                  >
                    Xem chi tiết
                  </Link>
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
                  <p className="[overflow-wrap:anywhere] font-medium">
                    {user.displayName}
                  </p>
                  <p className="break-all text-sm text-muted">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <RoleBadges roles={user.roles} />
                    <StatusBadge status={user.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Tạo lúc {dateFormatter.format(new Date(user.createdAt))}
                  </p>
                </div>
              </div>
              <Link
                href={`/admin/users/${user.id}?${query}`}
                className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold text-primary hover:underline"
                aria-label={`Xem chi tiết ${user.displayName}`}
              >
                Xem chi tiết
              </Link>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-4">{pagination("cuối danh sách")}</div>
    </div>
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

function pageQuery(query: string, page: number) {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  params.delete("limit");
  return params.toString();
}
function firstPage(query: string) {
  return pageQuery(query, 1);
}

function UserPagination({
  query,
  page,
  totalPages,
  position,
  onNavigate,
}: {
  query: string;
  page: number;
  totalPages: number;
  position: string;
  onNavigate: (href: string) => void;
}) {
  const control = (label: string, target: number, disabled: boolean) => {
    const classes =
      "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2";
    if (disabled)
      return (
        <span aria-disabled="true" className={`${classes} text-muted`}>
          {label}
        </span>
      );
    const href = `/admin/users?${pageQuery(query, target)}`;
    return (
      <Link
        href={href}
        scroll={false}
        onNavigate={(event) => {
          event.preventDefault();
          onNavigate(href);
        }}
        className={`${classes} text-primary hover:bg-surface-hover`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label={`Phân trang người dùng, ${position}`}
      className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      {control("Trang trước", page - 1, page <= 1)}
      <span aria-current="page">
        Trang {page} / {totalPages}
      </span>
      {control("Trang sau", page + 1, page >= totalPages)}
    </nav>
  );
}

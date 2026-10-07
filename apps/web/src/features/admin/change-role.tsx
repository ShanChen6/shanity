"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useSession } from "@/features/auth/session-provider";
import { ApiError, errorMessage } from "@/lib/api";
import { changeUserRole, type UserRoleInput } from "./api";
import { roleLabels } from "./user-badges";
import { useAdminFeedback } from "./admin-feedback";
import { useConfirmationFocus } from "./use-confirmation-focus";
import type { AdminUser } from "./types";

export function ChangeRole({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: (user: AdminUser) => void;
}) {
  const session = useSession();
  const [role, setRole] = useState<UserRoleInput | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notify = useAdminFeedback();
  const { dialog, cancel, trigger, fallback, failure, open, restore, trapTab } =
    useConfirmationFocus();
  useEffect(() => {
    if (error && !saving) failure.current?.focus();
  }, [error, saving, failure]);
  const pending = useRef(false);
  const isSelf = session.user?.id === user.id;
  const unchanged =
    user.roles.length === 1 && user.roles[0] === role.toLowerCase();
  async function confirm() {
    if (!role || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const updated = await changeUserRole(user.id, role);
      dialog.current?.close();
      onChanged(updated);
      setRole("");
      notify("Đã cập nhật vai trò.");
      if (isSelf) void session.load();
    } catch (reason: unknown) {
      setError(
        reason instanceof ApiError && reason.status === 409
          ? reason.messages.join(" ")
          : errorMessage(reason),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className="mt-6 border-t border-border pt-6"
      aria-labelledby="change-role-heading"
    >
      <h3
        id="change-role-heading"
        className="font-heading text-h3 font-semibold"
      >
        Thay đổi vai trò
      </h3>
      <p className="mt-2 text-sm text-muted">
        Vai trò được chọn sẽ thay thế toàn bộ vai trò hiện tại.
      </p>
      {isSelf && (
        <p className="mt-2 text-sm text-muted">
          Bạn không thể tự hạ quyền quản trị của tài khoản đang sử dụng.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-48 space-y-1 text-sm">
          <span>Vai trò mới</span>
          <Select
            ref={fallback}
            value={role}
            disabled={saving}
            onChange={(event) => {
              setRole(event.target.value as UserRoleInput | "");
            }}
          >
            <option value="">Chọn vai trò</option>
            <option value="STUDENT" disabled={isSelf}>
              Học sinh
            </option>
            <option value="INSTRUCTOR" disabled={isSelf}>
              Giảng viên
            </option>
            <option value="ADMIN">Quản trị viên</option>
            <option value="FINANCE_OFFICER" disabled={isSelf}>
              Nhân viên tài chính
            </option>
          </Select>
        </label>
        <Button
          ref={trigger}
          disabled={
            !role ||
            unchanged ||
            saving ||
            !session.user ||
            (isSelf && role !== "ADMIN")
          }
          onClick={() => {
            setError("");
            open();
          }}
        >
          Thay đổi vai trò
        </Button>
      </div>
      <dialog
        ref={dialog}
        onClose={restore}
        onKeyDown={trapTab}
        tabIndex={-1}
        aria-busy={saving}
        aria-labelledby="confirm-role-title"
        aria-describedby="confirm-role-description"
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <h2
          id="confirm-role-title"
          className="font-heading text-h2 font-semibold"
        >
          Xác nhận thay đổi vai trò
        </h2>
        <div id="confirm-role-description" className="mt-4 space-y-3 text-sm">
          <p className="[overflow-wrap:anywhere]">
            Tài khoản: <strong>{user.displayName}</strong>
          </p>
          <p className="break-all">{user.email}</p>
          <p>
            Vai trò hiện tại:{" "}
            {user.roles.map((value) => roleLabels[value] ?? value).join(", ") ||
              "Chưa có vai trò"}
            .
          </p>
          <p>
            Thay thế bằng: <strong>{roleLabels[role.toLowerCase()]}</strong>.
          </p>
          <p>Quyền truy cập của tài khoản sẽ thay đổi ngay sau khi xác nhận.</p>
        </div>
        {error && (
          <p
            ref={failure}
            tabIndex={-1}
            role="alert"
            className="mt-4 break-words text-sm text-danger-foreground"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            ref={cancel}
            variant="outline"
            disabled={saving}
            onClick={() => dialog.current?.close()}
          >
            Hủy
          </Button>
          <Button
            loading={saving}
            loadingLabel="Đang cập nhật…"
            onClick={() => void confirm()}
          >
            Xác nhận đổi vai trò
          </Button>
        </div>
      </dialog>
    </section>
  );
}

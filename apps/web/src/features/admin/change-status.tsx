"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session-provider";
import { ApiError, errorMessage } from "@/lib/api";
import { changeUserStatus } from "./api";
import { useAdminFeedback } from "./admin-feedback";
import { useConfirmationFocus } from "./use-confirmation-focus";
import type { AdminUser } from "./types";

export function ChangeStatus({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: (user: AdminUser) => void;
}) {
  const { user: currentUser } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notify = useAdminFeedback();
  const { dialog, cancel, trigger, failure, open, restore, trapTab } =
    useConfirmationFocus();
  useEffect(() => {
    if (error && !saving) failure.current?.focus();
  }, [error, saving, failure]);
  const pending = useRef(false);
  const disable = user.status === "active";
  const action = disable ? "Vô hiệu hóa tài khoản" : "Kích hoạt tài khoản";
  const isSelf = currentUser?.id === user.id;
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const updated = await changeUserStatus(
        user.id,
        disable ? "DISABLED" : "ACTIVE",
      );
      dialog.current?.close();
      onChanged(updated);
      notify(disable ? "Đã vô hiệu hóa tài khoản." : "Đã kích hoạt tài khoản.");
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
      aria-labelledby="change-status-heading"
    >
      <h3
        id="change-status-heading"
        className="font-heading text-h3 font-semibold"
      >
        Trạng thái tài khoản
      </h3>
      <p className="mt-2 text-sm text-muted">
        {isSelf
          ? "Bạn không thể vô hiệu hóa tài khoản quản trị đang sử dụng."
          : disable
            ? "Vô hiệu hóa sẽ chặn đăng nhập và truy cập bằng các phiên hiện có. Dữ liệu và vai trò được giữ lại."
            : "Kích hoạt để tài khoản có thể truy cập lại với các vai trò hiện tại."}
      </p>
      <Button
        ref={trigger}
        className="mt-4"
        variant={disable ? "danger" : "primary"}
        disabled={saving || !currentUser || (disable && isSelf)}
        onClick={() => {
          setError("");
          open();
        }}
      >
        {action}
      </Button>
      <dialog
        ref={dialog}
        onClose={restore}
        onKeyDown={trapTab}
        tabIndex={-1}
        aria-busy={saving}
        aria-labelledby="confirm-status-title"
        aria-describedby="confirm-status-description"
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <h2
          id="confirm-status-title"
          className="font-heading text-h2 font-semibold"
        >
          Xác nhận {disable ? "vô hiệu hóa" : "kích hoạt"} tài khoản
        </h2>
        <div id="confirm-status-description" className="mt-4 space-y-3 text-sm">
          <p className="[overflow-wrap:anywhere]">
            Tài khoản: <strong>{user.displayName}</strong>
          </p>
          <p className="break-all">{user.email}</p>
          <p>
            {disable
              ? "Người dùng sẽ bị chặn đăng nhập và truy cập hệ thống cho đến khi được kích hoạt lại."
              : "Người dùng có thể đăng nhập và truy cập lại với các vai trò hiện tại."}
          </p>
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
            variant={disable ? "danger" : "primary"}
            loading={saving}
            loadingLabel="Đang cập nhật…"
            onClick={() => void confirm()}
          >
            Xác nhận
          </Button>
        </div>
      </dialog>
    </section>
  );
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api";
import { useConfirmationFocus } from "@/features/admin/use-confirmation-focus";
import { useSession } from "./session-provider";
import { validatePassword, validateConfirmPassword } from "./validation";

const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };
const fields = [
  ["currentPassword", "Mật khẩu hiện tại", "current-password"],
  ["newPassword", "Mật khẩu mới", "new-password"],
  ["confirmPassword", "Xác nhận mật khẩu mới", "new-password"],
] as const;

export function ChangePassword() {
  const session = useSession();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Partial<typeof empty>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const { dialog, trigger, open, restore, trapTab } = useConfirmationFocus();
  function clear() {
    setValues(empty);
    setErrors({});
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const next = {
      currentPassword: validatePassword(values.currentPassword),
      newPassword:
        validatePassword(values.newPassword) ||
        (values.newPassword === values.currentPassword
          ? "Mật khẩu mới phải khác mật khẩu hiện tại."
          : undefined),
      confirmPassword: validateConfirmPassword(
        values.newPassword,
        values.confirmPassword,
      ),
    };
    setErrors(next);
    setError("");
    const invalid = fields.find(([key]) => next[key]);
    if (invalid) {
      document.getElementById(`change-${invalid[0]}`)?.focus();
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await session.changePassword(values.currentPassword, values.newPassword);
      clear();
      dialog.current?.close();
      // ProtectedSession redirects to /login after the session reset.
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 400
          ? reason.message
          : errorMessage(reason),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="secondary"
        disabled={!session.user?.hasPassword}
        aria-describedby={
          !session.user?.hasPassword ? "oauth-password-note" : undefined
        }
        onClick={() => {
          clear();
          open();
          document.getElementById("change-currentPassword")?.focus();
        }}
      >
        Đổi mật khẩu
      </Button>
      {!session.user?.hasPassword && (
        <p id="oauth-password-note" className="w-full text-sm text-muted">
          Tài khoản đăng nhập bằng Google chưa có mật khẩu để thay đổi.
        </p>
      )}
      <dialog
        ref={dialog}
        onClose={() => {
          clear();
          restore();
        }}
        onKeyDown={trapTab}
        tabIndex={-1}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        aria-labelledby="change-password-title"
        aria-describedby="change-password-description"
        aria-busy={saving}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-black/50 sm:p-6"
      >
        <h2 id="change-password-title" className="text-h2 font-semibold">
          Đổi mật khẩu
        </h2>
        <p id="change-password-description" className="mt-2 text-sm text-muted">
          Mật khẩu mới cần từ 12 đến 128 ký tự. Bạn sẽ đăng xuất khỏi phiên hiện
          tại sau khi đổi mật khẩu.
        </p>
        <form
          noValidate
          onSubmit={save}
          className="mt-6 space-y-5"
          aria-label="Đổi mật khẩu"
        >
          {fields.map(([key, label, autoComplete]) => (
            <FormField
              key={key}
              id={`change-${key}`}
              label={label}
              error={errors[key]}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete={autoComplete}
                  required
                  readOnly={saving}
                  value={values[key]}
                  onChange={(event) => {
                    setValues({ ...values, [key]: event.target.value });
                    setErrors({ ...errors, [key]: undefined });
                  }}
                />
              )}
            </FormField>
          ))}
          {error && (
            <p
              role="alert"
              className="break-words text-sm text-danger-foreground"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => dialog.current?.close()}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={saving}
              loading={saving}
              loadingLabel="Đang đổi mật khẩu…"
            >
              Đổi mật khẩu
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

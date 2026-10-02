"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/features/auth/session-provider";
import { createUser, updateUser, type UserRoleInput } from "./api";
import { useAdminFeedback } from "./admin-feedback";
import { useConfirmationFocus } from "./use-confirmation-focus";
import type { AdminUser } from "./types";

export function UserEditor({
  user,
  onChanged,
}: {
  user?: AdminUser;
  onChanged?: (user: AdminUser) => void;
}) {
  const router = useRouter();
  const session = useSession();
  const notify = useAdminFeedback();
  const titleId = useId();
  const [name, setName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRoleInput>("STUDENT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const { dialog, cancel, trigger, failure, open, restore, trapTab } =
    useConfirmationFocus();
  const action = user ? "Sửa thông tin" : "Thêm người dùng";
  useEffect(() => {
    if (error && !saving) failure.current?.focus();
  }, [error, saving, failure]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const input = {
        displayName: name.trim(),
        email: email.trim().toLowerCase(),
      };
      const updated = user
        ? await updateUser(user.id, input)
        : await createUser({ ...input, password, role });
      setPassword("");
      dialog.current?.close();
      onChanged?.(updated);
      notify(user ? "Đã cập nhật người dùng." : "Đã tạo người dùng.");
      if (session.user?.id === updated.id) void session.load();
      if (!user) router.push(`/admin/users/${updated.id}`);
    } catch (reason: unknown) {
      setError(
        reason instanceof ApiError && reason.status === 409
          ? "Email đã được sử dụng. Vui lòng chọn email khác."
          : errorMessage(reason),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="mt-6">
      <Button
        ref={trigger}
        variant={user ? "outline" : "primary"}
        onClick={() => {
          setName(user?.displayName ?? "");
          setEmail(user?.email ?? "");
          setPassword("");
          setRole("STUDENT");
          setError("");
          open();
        }}
      >
        {action}
      </Button>
      <dialog
        ref={dialog}
        onClose={() => {
          setPassword("");
          restore();
        }}
        onKeyDown={trapTab}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-busy={saving}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <h2 id={titleId} className="font-heading text-h2 font-semibold">
          {action}
        </h2>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-4 space-y-4"
        >
          <FormField label="Tên hiển thị">
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                pattern=".*\S.*"
                disabled={saving}
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField label="Email">
            {(props) => (
              <Input
                {...props}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                disabled={saving}
                autoComplete="off"
              />
            )}
          </FormField>
          {!user && (
            <>
              <FormField
                label="Mật khẩu ban đầu"
                description="Từ 12 đến 128 ký tự."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                    disabled={saving}
                    autoComplete="new-password"
                  />
                )}
              </FormField>
              <FormField label="Vai trò">
                {(props) => (
                  <select
                    {...props}
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value as UserRoleInput)
                    }
                    disabled={saving}
                    className="control w-full rounded-md border border-input bg-surface px-3 py-2.5"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="INSTRUCTOR">Instructor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                )}
              </FormField>
              {role === "ADMIN" && (
                <p className="text-sm text-muted">
                  Tài khoản này sẽ có toàn quyền quản trị hệ thống.
                </p>
              )}
            </>
          )}
          <p className="text-sm text-muted">
            Kiểm tra thông tin trước khi xác nhận{" "}
            {user ? "lưu thay đổi" : "tạo tài khoản"}.
          </p>
          {error && (
            <p
              ref={failure}
              tabIndex={-1}
              role="alert"
              className="break-words text-sm text-danger-foreground"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              ref={cancel}
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => dialog.current?.close()}
            >
              Hủy
            </Button>
            <Button type="submit" loading={saving} loadingLabel="Đang lưu…">
              {user ? "Xác nhận lưu" : "Xác nhận tạo"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

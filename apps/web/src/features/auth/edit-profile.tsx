"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api";
import { useConfirmationFocus } from "@/features/admin/use-confirmation-focus";
import { useSession } from "./session-provider";
import { validateName } from "./validation";

export function EditProfile() {
  const session = useSession();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const { dialog, trigger, open, restore, trapTab } = useConfirmationFocus();
  const unchanged = name.trim() === session.user?.displayName;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || unchanged) return;
    const invalid = validateName(name);
    setFieldError(invalid ?? "");
    setError("");
    if (invalid) {
      input.current?.focus();
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await session.update(name.trim());
      dialog.current?.close();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 400) {
        setFieldError("Tên hiển thị cần từ 1 đến 100 ký tự.");
        input.current?.focus();
      } else setError(errorMessage(reason));
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
        onClick={() => {
          setName(session.user?.displayName ?? "");
          setFieldError("");
          setError("");
          open();
          input.current?.focus();
        }}
      >
        Chỉnh sửa hồ sơ
      </Button>
      <dialog
        ref={dialog}
        onClose={restore}
        onKeyDown={trapTab}
        tabIndex={-1}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        aria-labelledby="edit-profile-title"
        aria-describedby="edit-profile-description"
        aria-busy={saving}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-black/50 sm:p-6"
      >
        <h2 id="edit-profile-title" className="text-h2 font-semibold">
          Chỉnh sửa hồ sơ
        </h2>
        <p id="edit-profile-description" className="mt-2 text-sm text-muted">
          Cập nhật tên hiển thị của bạn trên Shanity. Email đăng nhập không thể
          thay đổi tại đây.
        </p>
        <form
          noValidate
          onSubmit={save}
          className="mt-6 space-y-5"
          aria-label="Chỉnh sửa hồ sơ"
        >
          <FormField
            id="profile-display-name"
            label="Tên hiển thị"
            description="Từ 1 đến 100 ký tự."
            error={fieldError}
          >
            {(props) => (
              <Input
                {...props}
                ref={input}
                autoComplete="name"
                required
                readOnly={saving}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldError("");
                }}
              />
            )}
          </FormField>
          <FormField id="profile-email" label="Email đăng nhập">
            {(props) => (
              <Input
                {...props}
                value={session.user?.email ?? ""}
                readOnly
                type="email"
              />
            )}
          </FormField>
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
              disabled={unchanged || saving}
              loading={saving}
              loadingLabel="Đang lưu…"
            >
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

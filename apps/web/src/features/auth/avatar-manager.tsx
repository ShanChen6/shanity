"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ApiError, errorMessage } from "@/lib/api";
import { useConfirmationFocus } from "@/features/admin/use-confirmation-focus";
import { useSession } from "./session-provider";
import { CurrentUserAvatar } from "./current-user-avatar";

export function AvatarManager() {
  const session = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const objectUrl = useRef("");
  const picker = useRef<HTMLInputElement>(null);
  const { dialog, cancel, trigger, open, restore, trapTab } =
    useConfirmationFocus();
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  function clear(resetPicker = true) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setPreview("");
    setFile(null);
    if (resetPicker && picker.current) picker.current.value = "";
  }
  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    event.target.value = "";
    clear(false);
    setError("");
    setRemoving(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Vui lòng chọn ảnh JPEG, PNG hoặc WebP.");
      return;
    }
    if (!next.size || next.size > 2 * 1024 * 1024) {
      setError("Vui lòng chọn ảnh không rỗng, tối đa 2 MB.");
      return;
    }
    objectUrl.current = URL.createObjectURL(next);
    setPreview(objectUrl.current);
    setFile(next);
  }
  async function save() {
    if (pending.current || (!removing && !file)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (removing) await session.removeAvatar();
      else await session.uploadAvatar(file!);
      dialog.current?.close();
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 400
          ? "Ảnh không hợp lệ. Chọn ảnh JPEG, PNG hoặc WebP tĩnh, tối đa 2 MB và 16 megapixel."
          : errorMessage(reason),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="secondary"
        onClick={() => {
          clear();
          setError("");
          setRemoving(false);
          open();
        }}
      >
        {session.user?.avatarUrl ? "Đổi ảnh đại diện" : "Tải ảnh đại diện"}
      </Button>
      <dialog
        ref={dialog}
        tabIndex={-1}
        onKeyDown={trapTab}
        onClose={() => {
          clear();
          restore();
        }}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        aria-busy={busy}
        aria-labelledby="avatar-title"
        aria-describedby="avatar-description"
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-black/50 sm:p-6"
      >
        <h2 id="avatar-title" className="text-h2 font-semibold">
          Ảnh đại diện
        </h2>
        <p id="avatar-description" className="mt-2 text-sm text-muted">
          JPEG, PNG hoặc WebP tĩnh; tối đa 2 MB và 16 megapixel. Ảnh đại diện có
          thể được xem công khai qua liên kết ảnh.
        </p>
        <div className="my-5 flex justify-center">
          {preview ? (
            <div className="relative size-32 overflow-hidden rounded-full">
              <Image
                src={preview}
                alt="Xem trước ảnh đại diện"
                fill
                unoptimized
                className="object-cover"
                onError={() => {
                  clear();
                  setError("Không thể đọc ảnh. Vui lòng chọn ảnh khác.");
                }}
              />
            </div>
          ) : (
            <CurrentUserAvatar className="size-32 text-3xl" />
          )}
        </div>
        {removing ? (
          <p role="status" className="mb-5">
            Xóa ảnh đại diện? Tài khoản sẽ sử dụng chữ cái tên của bạn.
          </p>
        ) : (
          <div className="space-y-2">
            <label htmlFor="avatar-file" className="text-sm font-medium">
              Chọn ảnh
            </label>
            <Input
              ref={picker}
              id="avatar-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={select}
            />
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {session.user?.avatarUrl && !removing && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                clear();
                setError("");
                setRemoving(true);
              }}
            >
              Xóa ảnh đại diện
            </Button>
          )}
          <Button
            ref={cancel}
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (removing) {
                setRemoving(false);
                setError("");
              } else dialog.current?.close();
            }}
          >
            Hủy
          </Button>
          <Button
            disabled={busy || (!removing && !file)}
            variant={removing ? "danger" : "primary"}
            loading={busy}
            loadingLabel="Đang xử lý…"
            onClick={() => void save()}
          >
            {removing ? "Xác nhận xóa ảnh" : "Tải ảnh lên"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

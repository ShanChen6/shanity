"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PreviewMode = "default" | "error" | "loading" | "disabled";
export function LoginPreview() {
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("default");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [notice, setNotice] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const loading = submitting || mode === "loading";
  const disabled = loading || mode === "disabled";
  const fieldErrors =
    mode === "error"
      ? {
          email: "Vui lòng nhập địa chỉ email hợp lệ.",
          password: "Mật khẩu cần có ít nhất 12 ký tự.",
        }
      : errors;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setNotice("");
    const nextErrors: typeof errors = {};
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRef.current?.value.trim() ?? "")
    )
      nextErrors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    if ((passwordRef.current?.value.length ?? 0) < 12)
      nextErrors.password = "Mật khẩu cần có ít nhất 12 ký tự.";
    setMode("default");
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    timer.current = setTimeout(() => {
      setSubmitting(false);
      setNotice(
        "Bạn đã thử xong giao diện. Chưa có thông tin nào được gửi và chưa có tài khoản nào được đăng nhập.",
      );
      if (passwordRef.current) passwordRef.current.value = "";
      timer.current = null;
    }, 1000);
  }

  return (
    <div className="w-full max-w-[25rem]">
      <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.17em] text-primary">
        CHÀO MỪNG BẠN TRỞ LẠI
      </p>
      <h1 className="text-title font-semibold tracking-[-0.035em] sm:text-4xl">
        Cùng học tiếp nhé!
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Một hành trình mới bắt đầu từ bước nhỏ hôm nay.
      </p>

      <div className="mt-7">
        <Button
          variant="secondary"
          disabled
          className="w-full"
          aria-describedby="google-preview-note"
        >
          <span aria-hidden="true" className="text-lg font-bold">
            G
          </span>{" "}
          Tiếp tục với Google
        </Button>
        <p
          id="google-preview-note"
          className="mt-2 text-center text-xs text-muted"
        >
          Sẽ có khi tính năng đăng nhập được kết nối.
        </p>
      </div>
      <div className="my-6 flex items-center gap-4 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        <span>hoặc dùng email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={submit}
        noValidate
        aria-label="Đăng nhập mẫu"
        aria-describedby="preview-note"
        className="space-y-5"
      >
        <FormField id="login-email" label="Email" error={fieldErrors.email}>
          {(props) => (
            <div className="relative">
              <Icon
                name="mail"
                className="pointer-events-none absolute left-3.5 top-4 text-muted"
              />
              <Input
                {...props}
                ref={emailRef}
                type="email"
                autoComplete="username"
                placeholder="ban@example.com"
                maxLength={254}
                required
                disabled={disabled}
                className="pl-11"
              />
            </div>
          )}
        </FormField>
        <FormField
          id="login-password"
          label="Mật khẩu"
          error={fieldErrors.password}
        >
          {(props) => (
            <div className="relative">
              <Icon
                name="lock"
                className="pointer-events-none absolute left-3.5 top-4 text-muted"
              />
              <Input
                {...props}
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu của bạn"
                maxLength={128}
                required
                disabled={disabled}
                className="pl-11 pr-14"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-controls="login-password"
                aria-pressed={showPassword}
                disabled={disabled}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-lg text-muted hover:text-primary disabled:cursor-not-allowed"
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} />
              </button>
            </div>
          )}
        </FormField>
        <div className="-mt-1 flex justify-end">
          <Button
            variant="ghost"
            className="-mr-3 text-xs"
            onClick={() =>
              setNotice(
                "Khôi phục mật khẩu sẽ được bổ sung ở giai đoạn tiếp theo.",
              )
            }
          >
            Quên mật khẩu?
          </Button>
        </div>
        {(fieldErrors.email || fieldErrors.password) && (
          <Alert tone="error" title="Kiểm tra lại thông tin">
            Hãy sửa các trường được đánh dấu bên trên.
          </Alert>
        )}
        <Button
          type="submit"
          className="w-full"
          loading={loading}
          loadingLabel="Đang thử giao diện…"
          disabled={mode === "disabled"}
        >
          Đăng nhập <Icon name="arrow" className="size-4" />
        </Button>
        <p aria-live="polite" className="sr-only">
          {loading ? "Đang thử trạng thái tải. Không gửi dữ liệu." : ""}
        </p>
      </form>
      <div className="mt-3 text-center text-sm text-muted">
        Bạn mới đến Shanity?{" "}
        <Button
          variant="ghost"
          className="px-1 text-sm"
          onClick={() =>
            setNotice(
              "Giao diện tạo tài khoản sẽ được bổ sung ở giai đoạn tiếp theo.",
            )
          }
        >
          Tạo tài khoản
        </Button>
      </div>
      {notice && (
        <div className="mt-3">
          <Alert>{notice}</Alert>
        </div>
      )}
      <p
        id="preview-note"
        className="mt-5 text-center text-xs leading-5 text-muted"
      >
        Bản xem trước giao diện. Chỉ dùng thông tin mẫu.
        <br />
        Không gửi dữ liệu và không tạo phiên đăng nhập.
      </p>

      <details className="mt-5 border-t border-border pt-3">
        <summary className="control flex items-center gap-2 rounded-lg text-xs text-muted">
          Xem các trạng thái giao diện <span aria-hidden="true">＋</span>
        </summary>
        <Card className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preview-mode">Trạng thái biểu mẫu</Label>
            <select
              id="preview-mode"
              value={mode}
              onChange={(event) => {
                if (timer.current) clearTimeout(timer.current);
                setSubmitting(false);
                setMode(event.target.value as PreviewMode);
                setNotice("");
                setErrors({});
              }}
              className="control w-full rounded-control border border-border bg-surface px-3 text-sm"
            >
              <option value="default">Mặc định</option>
              <option value="error">Lỗi validation</option>
              <option value="loading">Đang tải</option>
              <option value="disabled">Vô hiệu hóa</option>
            </select>
          </div>
          <Alert tone="success">Thông tin mẫu đã sẵn sàng.</Alert>
          <Alert tone="warning">Đây chỉ là thông báo minh họa.</Alert>
        </Card>
      </details>
    </div>
  );
}

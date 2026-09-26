"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { API_URL, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "./session-provider";
import { validateCredentials, type Fields } from "./validation";

export function CredentialsForm({ register = false }: { register?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [displayName, setDisplayName] = useState("");
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Fields>({}),
    [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    if (session.status === "authenticated") router.replace("/profile");
  }, [session.status, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const next = validateCredentials(
      email,
      password,
      register ? displayName : undefined,
    );
    setFields(next);
    setError("");
    const invalid = (["displayName", "email", "password"] as const).find(
      (key) => next[key],
    );
    if (invalid) {
      document.getElementById(`auth-${invalid}`)?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await session.signIn(register ? "/auth/register" : "/auth/login", {
        email: email.trim().toLowerCase(),
        password,
        ...(register ? { displayName: displayName.trim() } : {}),
      });
      setPassword("");
      router.replace("/profile");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setFields({
          email:
            "Email đã được sử dụng. Bạn có thể đăng nhập vào tài khoản hiện có.",
        });
        document.getElementById("auth-email")?.focus();
      } else if (reason instanceof ApiError && reason.status === 400) {
        const nextFields: Fields = {};
        if (reason.messages.some((message) => message.startsWith("email ")))
          nextFields.email = "Địa chỉ email không hợp lệ.";
        if (reason.messages.some((message) => message.startsWith("password ")))
          nextFields.password = "Mật khẩu cần từ 12 đến 128 ký tự.";
        if (
          reason.messages.some((message) => message.startsWith("displayName "))
        )
          nextFields.displayName = "Tên hiển thị cần từ 1 đến 100 ký tự.";
        setFields(nextFields);
        setError("Vui lòng kiểm tra thông tin trong biểu mẫu.");
      } else setError(errorMessage(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (session.status === "loading" || session.status === "authenticated")
    return <Spinner label="Đang kiểm tra phiên đăng nhập" />;
  return (
    <div className="w-full max-w-[25rem]">
      <p className="mb-3 text-xs font-semibold tracking-widest text-primary">
        {register ? "BẮT ĐẦU CÙNG SHANITY" : "CHÀO MỪNG BẠN TRỞ LẠI"}
      </p>
      <h1 className="text-title font-semibold tracking-tight">
        {register ? "Tạo tài khoản của bạn" : "Cùng học tiếp nhé!"}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {register
          ? "Một bước nhỏ hôm nay, thêm nhiều điều mới ngày mai."
          : "Đăng nhập để tiếp tục hành trình học tập."}
      </p>
      <Button
        className="mt-7 w-full"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          window.location.assign(new URL("/auth/google", API_URL).href);
        }}
      >
        <span aria-hidden="true" className="text-lg font-bold">
          G
        </span>{" "}
        Tiếp tục với Google
      </Button>
      <div className="my-6 flex items-center gap-4 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        hoặc dùng email
        <span className="h-px flex-1 bg-border" />
      </div>
      {session.status === "error" && (
        <div className="mb-4">
          <Alert tone="warning">{session.error}</Alert>
        </div>
      )}
      <form
        noValidate
        onSubmit={submit}
        className="space-y-5"
        aria-label={register ? "Đăng ký" : "Đăng nhập"}
      >
        {register && (
          <FormField
            id="auth-displayName"
            label="Tên hiển thị"
            error={fields.displayName}
          >
            {(props) => (
              <Input
                {...props}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
                disabled={busy}
              />
            )}
          </FormField>
        )}
        <FormField id="auth-email" label="Email" error={fields.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              disabled={busy}
              placeholder="ban@example.com"
            />
          )}
        </FormField>
        <FormField
          id="auth-password"
          label="Mật khẩu"
          description={
            register
              ? "Từ 12 đến 128 ký tự. Không chia sẻ mật khẩu với người khác."
              : undefined
          }
          error={fields.password}
        >
          {(props) => (
            <div className="relative">
              <Input
                {...props}
                type={visible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? "new-password" : "current-password"}
                required
                disabled={busy}
                className="pr-14"
              />
              <button
                type="button"
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={visible}
                aria-controls="auth-password"
                disabled={busy}
                onClick={() => setVisible(!visible)}
                className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-lg text-muted hover:text-primary"
              >
                <Icon name={visible ? "eyeOff" : "eye"} />
              </button>
            </div>
          )}
        </FormField>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          type="submit"
          className="w-full"
          loading={busy}
          loadingLabel="Đang xử lý…"
        >
          {register ? "Tạo tài khoản" : "Đăng nhập"} <Icon name="arrow" />
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {register ? "Bạn đã có tài khoản?" : "Bạn mới đến Shanity?"}{" "}
        <Link
          className="inline-flex min-h-11 items-center px-1 font-semibold text-primary hover:underline"
          href={register ? "/login" : "/register"}
        >
          {register ? "Đăng nhập" : "Tạo tài khoản"}
        </Link>
      </p>
    </div>
  );
}

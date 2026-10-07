"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/session-provider";
import { validateCredentials, type Fields } from "@/features/auth/validation";
import { errorMessage } from "@/lib/api";
import {
  adminDestination,
  hasAnyRole,
  ORDER_CONSOLE_ROLES,
} from "@/lib/admin-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/components/ui/icon";

const deniedMessage =
  "Tài khoản này không có quyền quản trị. Vui lòng sử dụng tài khoản quản trị viên.";

export function AdminLoginForm({ destination }: { destination: string }) {
  const session = useSession();
  const router = useRouter();
  const load = session.load;
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState("");
  const pending = useRef(false);
  const errorContainer = useRef<HTMLDivElement>(null);
  const isAdmin =
    session.status === "authenticated" &&
    !!session.user &&
    hasAnyRole(session.user.roles, ORDER_CONSOLE_ROLES);
  const denied = session.status === "authenticated" && !isAdmin;
  const notice =
    error ||
    (denied ? deniedMessage : session.status === "error" ? session.error : "");
  useEffect(() => {
    let active = true;
    void load().finally(() => {
      if (active) setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    if (checked && isAdmin && session.user)
      router.replace(adminDestination(session.user.roles, destination));
  }, [checked, isAdmin, destination, router, session.user]);
  useEffect(() => {
    if (checked && notice) errorContainer.current?.focus();
  }, [checked, notice]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const next = validateCredentials(email, password);
    setFields(next);
    setError("");
    const invalid = (["email", "password"] as const).find((key) => next[key]);
    if (invalid) {
      document.getElementById(`admin-login-${invalid}`)?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const profile = await session.signIn("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      if (!hasAnyRole(profile.roles, ORDER_CONSOLE_ROLES)) {
        setError(deniedMessage);
        return;
      }
      router.replace(adminDestination(profile.roles, destination));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setPassword("");
      pending.current = false;
      setBusy(false);
    }
  }
  if (!checked || session.status === "loading" || isAdmin)
    return <Spinner label="Đang kiểm tra quyền quản trị" />;
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        Admin Portal
      </p>
      <h1 className="mt-3 font-heading text-h1 font-semibold">
        Đăng nhập quản trị
      </h1>
      <p className="mt-3 text-sm text-muted">
        Sử dụng tài khoản được cấp quyền để quản lý Shanity.
      </p>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={submit}
        aria-label="Đăng nhập quản trị"
        aria-busy={busy}
      >
        <FormField id="admin-login-email" label="Email" error={fields.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              disabled={busy}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="admin-login-password"
          label="Mật khẩu"
          error={fields.password}
        >
          {(props) => (
            <div className="relative">
              <Input
                {...props}
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                maxLength={128}
                required
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-controls="admin-login-password"
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
                className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-muted hover:text-primary"
              >
                <Icon name={visible ? "eyeOff" : "eye"} />
              </button>
            </div>
          )}
        </FormField>
        {notice && (
          <div ref={errorContainer} tabIndex={-1}>
            <Alert tone="error">{notice}</Alert>
          </div>
        )}
        <Button
          className="w-full"
          type="submit"
          loading={busy}
          loadingLabel="Đang đăng nhập…"
        >
          Đăng nhập
        </Button>
        <p aria-live="polite" className="sr-only">
          {busy ? "Đang xác thực tài khoản quản trị." : ""}
        </p>
      </form>
    </>
  );
}

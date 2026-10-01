"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "./session-provider";
import { validateName } from "./validation";

export function Profile() {
  const { user } = useSession();
  return <ProfileContent key={user?.id ?? "signed-out"} />;
}

function ProfileContent() {
  const session = useSession(),
    router = useRouter();
  const [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState(""),
    [fieldError, setFieldError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  async function perform(action: string, task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft ?? session.user?.displayName ?? "";
    const invalid = validateName(name);
    setFieldError(invalid ?? "");
    if (invalid) {
      document.getElementById("profile-name")?.focus();
      return;
    }
    await perform("save", async () => {
      await session.update(name.trim());
      setDraft(null);
      setNotice("Đã cập nhật hồ sơ.");
    });
  }
  if (session.status === "loading" || session.status === "anonymous")
    return (
      <PageContainer className="py-16">
        <Spinner label="Đang kiểm tra phiên đăng nhập" />
      </PageContainer>
    );
  if (session.status === "error")
    return (
      <PageContainer className="py-16">
        <Alert tone="error">{session.error}</Alert>
        <Button className="mt-4" onClick={() => void session.load()}>
          Thử lại
        </Button>
      </PageContainer>
    );
  if (!session.user) return null;
  const roles: Record<string, string> = {
    student: "Học sinh",
    instructor: "Giảng viên",
    admin: "Quản trị viên",
  };
  return (
    <PageContainer className="max-w-3xl py-8 sm:py-14">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-2xl font-bold">
          shanity.
        </Link>
        <Button
          variant="secondary"
          disabled={!!busy}
          loading={busy === "logout"}
          onClick={() =>
            void perform("logout", async () => {
              await session.logout();
              router.replace("/login");
            })
          }
        >
          Đăng xuất
        </Button>
      </header>
      <main>
        <h1 className="text-title font-semibold">Hồ sơ của bạn</h1>
        <p className="mb-6 mt-2 text-muted">
          Quản lý thông tin bạn sử dụng trên Shanity.
        </p>
        {session.message && !notice && (
          <div className="mb-4">
            <Alert tone="success">{session.message}</Alert>
          </div>
        )}
        <Card>
          <dl className="mb-6 space-y-3">
            <div>
              <dt className="text-sm text-muted">Email</dt>
              <dd className="break-all font-medium">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Vai trò</dt>
              <dd>
                {session.user.roles
                  .map((role) => roles[role] ?? role)
                  .join(", ") || "Chưa được phân vai trò"}
              </dd>
            </div>
          </dl>
          <form onSubmit={save} noValidate className="space-y-5">
            <FormField
              id="profile-name"
              label="Tên hiển thị"
              error={fieldError}
            >
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  value={draft ?? session.user!.displayName}
                  disabled={!!busy}
                  onChange={(e) => setDraft(e.target.value)}
                  required
                />
              )}
            </FormField>
            <Button type="submit" disabled={!!busy} loading={busy === "save"}>
              Lưu thay đổi
            </Button>
          </form>
          <div className="mt-6 border-t border-border pt-5">
            <h2 className="mb-2 font-semibold">Tài khoản Google</h2>
            <p className="mb-3 text-sm text-muted">
              Liên kết Google để có thêm cách đăng nhập vào tài khoản này.
            </p>
            <Button
              variant="secondary"
              disabled={!!busy}
              loading={busy === "google"}
              onClick={() =>
                void perform("google", async () => {
                  const result = await api<{ url: string }>(
                    "/auth/google/link",
                    { method: "POST" },
                  );
                  window.location.assign(result.url);
                })
              }
            >
              Liên kết Google
            </Button>
          </div>
          {session.user.roles.includes("admin") && (
            <div className="mt-5">
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() =>
                  void perform("admin", async () => {
                    await api("/users/admin-check");
                    setNotice("Máy chủ đã xác nhận quyền quản trị.");
                  })
                }
              >
                Kiểm tra quyền quản trị
              </Button>
            </div>
          )}
        </Card>
        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {notice && (
          <div className="mt-4">
            <Alert tone="success">{notice}</Alert>
          </div>
        )}
      </main>
    </PageContainer>
  );
}

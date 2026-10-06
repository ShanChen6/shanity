"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  GOOGLE_RETURN_KEY,
  homeForRoles,
  loginUrl,
  postLoginRedirect,
  safeRedirect,
} from "@/lib/auth-redirect";
import { useSession } from "./session-provider";
const errors: Record<string, string> = {
  cancelled:
    "Bạn đã hủy đăng nhập Google. Bạn có thể thử lại hoặc đăng nhập bằng email.",
  account_conflict:
    "Tài khoản Google hoặc email đã được sử dụng. Đăng nhập tài khoản hiện có rồi chọn Liên kết Google trong hồ sơ.",
  rate_limited: "Bạn thử quá nhiều lần. Vui lòng chờ một phút.",
  unavailable:
    "Đăng nhập Google hiện chưa sẵn sàng. Vui lòng dùng email hoặc thử lại sau.",
  failed:
    "Không thể hoàn tất đăng nhập Google. Phiên xác nhận có thể đã hết hạn. Vui lòng bắt đầu lại.",
};
export function OAuthCallback() {
  const params = useSearchParams(),
    session = useSession(),
    router = useRouter();
  const code = params.get("error");
  const linked = params.get("result") === "linked";
  const redirected = useRef(false);
  useEffect(() => {
    const user = session.user;
    if (
      !code &&
      session.status === "authenticated" &&
      user &&
      !redirected.current
    ) {
      redirected.current = true;
      // Account linking starts from /profile, so it always returns there.
      let destination = linked ? "/profile" : homeForRoles(user.roles);
      try {
        destination = linked
          ? "/profile"
          : postLoginRedirect(
              sessionStorage.getItem(GOOGLE_RETURN_KEY),
              user.roles,
            );
        sessionStorage.removeItem(GOOGLE_RETURN_KEY);
      } catch {
        /* Storage unavailable: use the safe default. */
      }
      router.replace(destination);
    }
  }, [code, linked, session.status, session.user, router]);
  const message = code
    ? (errors[code] ?? errors.failed)
    : session.status === "anonymous"
      ? errors.failed
      : session.status === "error"
        ? session.error
        : "";
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-5 text-title font-semibold">Kết nối với Google</h1>
      {message ? (
        <>
          <Alert tone="error">{message}</Alert>
          <Link
            href={session.user ? "/profile" : "/login"}
            onClick={(event) => {
              if (session.user) return;
              event.preventDefault();
              // Keep "no explicit return URL" so the next login uses the role home.
              let requested = "";
              try {
                requested = safeRedirect(
                  sessionStorage.getItem(GOOGLE_RETURN_KEY),
                  "",
                );
              } catch {}
              router.push(requested ? loginUrl(requested) : "/login");
            }}
            className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary"
          >
            {session.user ? "Về hồ sơ" : "Về đăng nhập"} →
          </Link>
        </>
      ) : (
        <Spinner label="Đang xác nhận phiên đăng nhập Google" />
      )}
    </div>
  );
}

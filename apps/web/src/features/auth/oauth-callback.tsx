"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
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
  useEffect(() => {
    if (!code && session.status === "authenticated") router.replace("/profile");
  }, [code, session.status, router]);
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

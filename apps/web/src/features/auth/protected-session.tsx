"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "./session-provider";
import type { Role } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Handles logout/revocation while an already-rendered layout is retained by Next.
export function ProtectedSession({
  children,
  requiredRole,
}: {
  children: ReactNode;
  requiredRole?: Role;
}) {
  const session = useSession();
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const denied =
    session.status === "authenticated" &&
    !!requiredRole &&
    !session.user?.roles.includes(requiredRole);
  useEffect(() => {
    if (denied) router.replace("/forbidden");
    else if (session.status === "anonymous") {
      const query = search.toString();
      router.replace(
        loginUrl(pathname + (query ? `?${query}` : "") + window.location.hash),
      );
    }
  }, [denied, session.status, router, pathname, search]);
  if (session.status === "error")
    return (
      <main className="container py-16">
        <Alert tone="error">{session.error}</Alert>
        <Button onClick={() => void session.load()}>Thử lại</Button>
      </main>
    );
  if (denied || session.status !== "authenticated")
    return <Spinner label="Đang kiểm tra phiên đăng nhập" />;
  return children;
}

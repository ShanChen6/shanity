import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { requireAnyRole, requireUser } from "@/lib/server-session";
import { rolesForAdminPath } from "@/lib/admin-access";
import { ProtectedSession } from "@/features/auth/protected-session";
import { Spinner } from "@/components/ui/spinner";
export const metadata = { robots: { index: false, follow: false } };

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Proxy overwrites this header. Check the route's role before the client
  // session gate can hide nested layouts behind its initial loading state.
  const pathname = (await headers()).get("x-shanity-return-to")?.split("?")[0];
  if (pathname === "/admin" || pathname?.startsWith("/admin/"))
    await requireAnyRole(rolesForAdminPath(pathname));
  else await requireUser();
  return (
    <Suspense fallback={<Spinner label="Đang kiểm tra phiên đăng nhập" />}>
      <ProtectedSession>{children}</ProtectedSession>
    </Suspense>
  );
}

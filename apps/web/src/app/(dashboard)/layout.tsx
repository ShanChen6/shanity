import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/server-session";
import { ProtectedSession } from "@/features/auth/protected-session";
import { CatalogShell } from "@/features/courses/catalog-view";
import { Spinner } from "@/components/ui/spinner";
export const metadata = { robots: { index: false, follow: false } };

// Learner dashboard pages: signed-in only, rendered inside the public site shell.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <CatalogShell>
      <Suspense fallback={<Spinner label="Đang kiểm tra phiên đăng nhập" />}>
        <ProtectedSession>{children}</ProtectedSession>
      </Suspense>
    </CatalogShell>
  );
}

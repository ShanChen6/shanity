import type { ReactNode } from "react";
import { requireRole } from "@/lib/server-session";
import { ProtectedSession } from "@/features/auth/protected-session";
import { AdminLayout } from "@/components/layout/admin-layout";
export const metadata = { title: "Quản trị · Shanity" };
export default async function Layout({ children }: { children: ReactNode }) {
  await requireRole("admin");
  return (
    <ProtectedSession requiredRole="admin">
      <AdminLayout>{children}</AdminLayout>
    </ProtectedSession>
  );
}

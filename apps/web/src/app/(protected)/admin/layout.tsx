import type { ReactNode } from "react";
import { requireAnyRole } from "@/lib/server-session";
import { ORDER_CONSOLE_ROLES } from "@/lib/admin-access";
import { homeForRoles } from "@/lib/auth-redirect";
import { AdminAccessGate } from "@/features/admin/admin-access-gate";
import { AdminLayout } from "@/components/layout/admin-layout";
export const metadata = { title: "Quản trị · Shanity" };
export default async function Layout({ children }: { children: ReactNode }) {
  // The layout is shared; each admin-only page still calls requireRole("admin").
  const user = await requireAnyRole(ORDER_CONSOLE_ROLES);
  return (
    <AdminAccessGate>
      <AdminLayout homeHref={homeForRoles(user.roles)}>{children}</AdminLayout>
    </AdminAccessGate>
  );
}

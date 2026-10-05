import type { ReactNode } from "react";
import { AdminAuthLayout } from "@/features/admin/auth/admin-auth-layout";
export default function Layout({ children }: { children: ReactNode }) {
  return <AdminAuthLayout>{children}</AdminAuthLayout>;
}

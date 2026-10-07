"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProtectedSession } from "@/features/auth/protected-session";
import { rolesForAdminPath } from "@/lib/admin-access";

// Client-side mirror of the server check, so a role change or a client-side
// navigation cannot leave a finance officer on an admin-only page.
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ProtectedSession requiredRole={rolesForAdminPath(pathname)}>
      {children}
    </ProtectedSession>
  );
}

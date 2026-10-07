import {
  ADMIN_ROLES,
  hasAnyRole,
  ORDER_CONSOLE_ROLES,
} from "@/lib/admin-access";
import type { Role } from "@/lib/api";

// Only modules supported by the current admin foundation belong here.
export const adminNavigation = [
  {
    href: "/admin",
    label: "Trang quản trị",
    icon: "grid",
    roles: ADMIN_ROLES,
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    icon: "users",
    roles: ADMIN_ROLES,
  },
  {
    href: "/admin/orders",
    label: "Đơn hàng",
    icon: "receipt",
    roles: ORDER_CONSOLE_ROLES,
  },
] as const;

// Staff only see the links they can open (finance officers: orders only).
export function adminNavigationFor(roles: readonly Role[]) {
  return adminNavigation.filter((item) => hasAnyRole(roles, item.roles));
}

export function isAdminNavActive(pathname: string, href: string) {
  return (
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

export function getAdminSection(pathname: string) {
  return adminNavigation.find((item) => isAdminNavActive(pathname, item.href));
}

// Only modules supported by the current admin foundation belong here.
export const adminNavigation = [
  { href: "/admin", label: "Trang quản trị", icon: "grid" },
  { href: "/admin/users", label: "Người dùng", icon: "users" },
] as const;

export function isAdminNavActive(pathname: string, href: string) {
  return (
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

export function getAdminSection(pathname: string) {
  return adminNavigation.find((item) => isAdminNavActive(pathname, item.href));
}

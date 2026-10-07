import type { Role } from "./api";

// Pages under /admin are admin-only except the order console, which finance
// officers also use. The API re-checks every request; this only routes the UI.
export const ADMIN_ROLES: readonly Role[] = ["admin"];
export const ORDER_CONSOLE_ROLES: readonly Role[] = [
  "admin",
  "finance_officer",
];

export function rolesForAdminPath(pathname: string): readonly Role[] {
  return /^\/admin\/orders(?:\/|$)/.test(pathname)
    ? ORDER_CONSOLE_ROLES
    : ADMIN_ROLES;
}

export function hasAnyRole(
  userRoles: readonly Role[],
  allowed: readonly Role[],
) {
  return allowed.some((role) => userRoles.includes(role));
}

// Staff who cannot open `destination` (a finance officer sent to /admin) land
// on the order console instead of a forbidden page.
export function adminDestination(roles: readonly Role[], destination: string) {
  const pathname = destination.split(/[?#]/)[0];
  return hasAnyRole(roles, rolesForAdminPath(pathname))
    ? destination
    : "/admin/orders";
}

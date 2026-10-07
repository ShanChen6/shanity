import type { Role } from "./api";

// Shared by server routing and browser navigation. Never accept an external URL.
export function safeRedirect(
  value: string | null | undefined,
  fallback = "/profile",
): string {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20\x7f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://shanity.invalid");
    let path = url.pathname;
    // Check encoded separators and auth routes too; don't decode the returned URL.
    for (let i = 0; i < 5; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
      if (i === 4) return fallback;
    }
    if (
      url.origin !== "https://shanity.invalid" ||
      path.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(path)
    )
      return fallback;
    path = new URL(path, "https://shanity.invalid").pathname;
    if (
      /^\/(?:login|register|auth|api|_next)(?:\/|$)/.test(path) ||
      /^\/admin\/login(?:\/|$)/.test(path)
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
export function safeAdminRedirect(value: string | null | undefined): string {
  const destination = safeRedirect(value);
  try {
    const pathname = new URL(destination, "https://shanity.invalid").pathname;
    let decoded = pathname;
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    const canonical = new URL(decoded, "https://shanity.invalid").pathname;
    if (
      decoded.includes("//") ||
      !/^\/admin(?:\/|$)/.test(pathname) ||
      !/^\/admin(?:\/|$)/.test(canonical) ||
      /^\/admin\/login(?:\/|$)/.test(canonical)
    )
      return "/admin";
    return destination;
  } catch {
    return "/admin";
  }
}
export function loginUrl(destination: string) {
  const safe = safeRedirect(destination);
  if (
    /^\/admin(?:\/|$)/.test(new URL(safe, "https://shanity.invalid").pathname)
  ) {
    const adminDestination = safeAdminRedirect(safe);
    return adminDestination === "/admin"
      ? "/admin/login"
      : `/admin/login?${new URLSearchParams({ redirect: adminDestination })}`;
  }
  return `/login?${new URLSearchParams({ redirect: safe })}`;
}
// Landing page when login has no explicit return URL. Staff keep their portals.
export function homeForRoles(roles: readonly Role[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("finance_officer")) return "/admin/orders";
  if (roles.includes("instructor")) return "/instructor/courses";
  return "/my-learning";
}
// An explicit, safe ?redirect= wins; otherwise land on the role's home.
export function postLoginRedirect(
  value: string | null | undefined,
  roles: readonly Role[],
): string {
  return safeRedirect(value, homeForRoles(roles));
}
export const GOOGLE_RETURN_KEY = "shanity-google-return";

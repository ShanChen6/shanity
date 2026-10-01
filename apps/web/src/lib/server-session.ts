import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role, User } from "./api";
import { loginUrl } from "./auth-redirect";

// Reuse in future server pages/actions before reading protected data.
// Request-scoped React cache; never cache a user's session across requests.
export const getServerUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const cookie = ["__Host-shanity_access", "shanity_access"]
    .map((name) => jar.get(name))
    .filter((item) => item?.value)
    .map((item) => `${item!.name}=${encodeURIComponent(item!.value)}`)
    .join("; ");
  if (!cookie) return null;
  const origin =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  const response = await fetch(new URL("/users/me", origin), {
    headers: { cookie },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  // Refresh stays in the existing browser lock to avoid rotating twice across tabs.
  // Login bootstrap silently refreshes a valid refresh cookie, then returns here.
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Không thể kiểm tra phiên đăng nhập.");
  return response.json() as Promise<User>;
});

export const requireUser = cache(async (): Promise<User> => {
  const user = await getServerUser();
  if (!user) {
    const destination =
      (await headers()).get("x-shanity-return-to") ?? "/profile";
    redirect(loginUrl(destination));
  }
  return user;
});

// Role codes come from NestJS /users/me (database-backed), never from URL/storage.
export const requireRole = cache(async (role: Role): Promise<User> => {
  const user = await requireUser();
  if (!user.roles.includes(role)) redirect("/forbidden");
  return user;
});

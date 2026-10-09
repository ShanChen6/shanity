import { api, apiFlatPage } from "@/lib/api";
import type {
  AdminUser,
  AdminUserListResponse,
  AdminUserStatistics,
} from "./types";

export function listUsers(query: string) {
  return apiFlatPage<AdminUser>(
    `/api/v1/admin/users?${query}`,
  ) satisfies Promise<AdminUserListResponse>;
}

export function getUser(id: string) {
  return api<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`);
}

export type UserRoleInput =
  | "STUDENT"
  | "INSTRUCTOR"
  | "ADMIN"
  | "FINANCE_OFFICER";
export function changeUserRole(id: string, role: UserRoleInput) {
  return api<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function changeUserStatus(id: string, status: "ACTIVE" | "DISABLED") {
  return api<AdminUser>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export function getUserStatistics() {
  return api<AdminUserStatistics>("/api/v1/admin/users/stats");
}

export type UserProfileInput = { displayName: string; email: string };
export function createUser(
  input: UserProfileInput & { password: string; role: UserRoleInput },
) {
  return api<AdminUser>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function updateUser(id: string, input: UserProfileInput) {
  return api<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

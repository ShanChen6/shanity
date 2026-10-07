import { api } from "@/lib/api";
import type {
  AdminUser,
  AdminUserListResponse,
  AdminUserStatistics,
} from "./types";

export function listUsers(query: string) {
  return api<AdminUserListResponse>(`/users?${query}`);
}

export function getUser(id: string) {
  return api<AdminUser>(`/users/${encodeURIComponent(id)}`);
}

export type UserRoleInput =
  | "STUDENT"
  | "INSTRUCTOR"
  | "ADMIN"
  | "FINANCE_OFFICER";
export function changeUserRole(id: string, role: UserRoleInput) {
  return api<AdminUser>(`/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function changeUserStatus(id: string, status: "ACTIVE" | "DISABLED") {
  return api<AdminUser>(`/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getUserStatistics() {
  return api<AdminUserStatistics>("/users/stats");
}

export type UserProfileInput = { displayName: string; email: string };
export function createUser(
  input: UserProfileInput & { password: string; role: UserRoleInput },
) {
  return api<AdminUser>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function updateUser(id: string, input: UserProfileInput) {
  return api<AdminUser>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

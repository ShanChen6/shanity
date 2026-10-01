import { api } from "@/lib/api";
import type { AdminUserListResponse } from "./types";

const DEFAULT_LIMIT = 20;

// GET /users: admin-only paginated account list (apps/api/src/auth/auth.controller.ts).
export function listUsers(page = 1, limit = DEFAULT_LIMIT) {
  return api<AdminUserListResponse>(`/users?page=${page}&limit=${limit}`);
}

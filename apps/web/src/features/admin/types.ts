// Matches GET /users (admin-only) in apps/api/src/auth/auth.controller.ts + auth.service.ts exactly.
import type { Role } from "@/lib/api";

export type AdminUserStatus = "active" | "disabled";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  status: AdminUserStatus;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUserListResponse = {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminUserStatistics = {
  totalUsers: number;
  students: number;
  instructors: number;
  admins: number;
  activeUsers: number;
};

// Standardized Auth/User request-response shapes, matching apps/api/src/auth/auth.dto.ts
// and apps/api/src/auth/auth.controller.ts exactly. Backend uses HttpOnly cookies
// (access + refresh, rotated on /auth/refresh) — tokens never reach JS, so
// login/register responses only acknowledge that cookies were issued.
import type { Role, User } from "@/lib/api";

export type { Role, User };

// POST /auth/login body
export type LoginRequest = {
  email: string;
  password: string;
};

// POST /auth/register body
export type RegisterRequest = LoginRequest & {
  displayName: string;
};

// Response body for POST /auth/login, /auth/register and /auth/refresh.
export type AuthResponse = {
  authenticated: true;
};

export type LoginResponse = AuthResponse;
export type RegisterResponse = AuthResponse;

// GET /users/me and PATCH /users/me response body
export type CurrentUserResponse = User;

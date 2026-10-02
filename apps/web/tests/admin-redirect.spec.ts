import { test, expect } from "@playwright/test";
import {
  safeAdminRedirect,
  safeRedirect,
  loginUrl,
} from "../src/lib/auth-redirect";

test("admin redirects reject external URLs, encoded traversal and auth loops", () => {
  for (const value of [
    null,
    undefined,
    "",
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/admin/../../login",
    "/admin/%2e%2e/profile",
    "/admin/..%2fprofile",
    "/admin/%252e%252e%252fprofile",
    "/admin/login",
    "/admin/login?redirect=/admin",
    "/admin/login/",
    "/admin/%6cogin",
    "/admin/%256cogin",
    "/admin/%2flogin",
    "/login",
    "/register",
    "/auth/callback",
    "/profile",
    "/administrator",
    "/admin\n/users",
    "/admin/%00",
    "/admin/%",
    "/admin/" + "a".repeat(2048),
  ]) {
    expect(safeAdminRedirect(value), String(value)).toBe("/admin");
  }
  for (const value of [
    "/admin",
    "/admin/users",
    "/admin/users?page=2&search=shan&role=student",
    "/admin/users/123#roles",
  ]) {
    expect(safeAdminRedirect(value)).toBe(value);
  }
  expect(safeRedirect("/admin/login")).toBe("/profile");
  expect(loginUrl("/admin")).toBe("/admin/login");
  expect(loginUrl("/admin/users?page=2")).toBe(
    "/admin/login?redirect=%2Fadmin%2Fusers%3Fpage%3D2",
  );
  expect(loginUrl("/profile")).toBe("/login?redirect=%2Fprofile");
});

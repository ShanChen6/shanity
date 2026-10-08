import { describe, expect, it } from "vitest";
import {
  adminDestination,
  hasAnyRole,
  ORDER_CONSOLE_ROLES,
  rolesForAdminPath,
} from "./admin-access";
import { homeForRoles, postLoginRedirect } from "./auth-redirect";
import { adminNav, navigationFor } from "@/config/navigation.config";

describe("order console access", () => {
  it("admits admins and finance officers to /admin/orders only", () => {
    for (const path of ["/admin/orders", "/admin/orders/abc"])
      expect(rolesForAdminPath(path)).toEqual(ORDER_CONSOLE_ROLES);
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/users/1",
      "/admin/orders-archive",
      "/admin/ordersx",
    ])
      expect(rolesForAdminPath(path)).toEqual(["admin"]);
    expect(
      hasAnyRole(["finance_officer"], rolesForAdminPath("/admin/orders")),
    ).toBe(true);
    expect(
      hasAnyRole(["finance_officer"], rolesForAdminPath("/admin/users")),
    ).toBe(false);
    expect(hasAnyRole(["instructor", "student"], ORDER_CONSOLE_ROLES)).toBe(
      false,
    );
  });

  it("sends finance officers to the console instead of a forbidden page", () => {
    expect(adminDestination(["finance_officer"], "/admin")).toBe(
      "/admin/orders",
    );
    expect(adminDestination(["finance_officer"], "/admin/users?page=2")).toBe(
      "/admin/orders",
    );
    expect(
      adminDestination(["finance_officer"], "/admin/orders?status=PENDING"),
    ).toBe("/admin/orders?status=PENDING");
    expect(adminDestination(["admin"], "/admin/users?page=2")).toBe(
      "/admin/users?page=2",
    );
  });

  it("lands finance officers on the console after login", () => {
    expect(homeForRoles(["finance_officer"])).toBe("/admin/orders");
    expect(homeForRoles(["admin", "finance_officer"])).toBe("/admin");
    expect(postLoginRedirect(null, ["finance_officer"])).toBe("/admin/orders");
  });

  it("shows finance officers only the links they can open", () => {
    expect(
      navigationFor(adminNav, ["finance_officer"]).map((item) => item.href),
    ).toEqual(["/admin/orders"]);
    expect(
      navigationFor(adminNav, ["admin"]).map((item) => item.href),
    ).toEqual(["/admin", "/admin/users", "/admin/orders", "/admin/settings"]);
    expect(navigationFor(adminNav, ["student"])).toEqual([]);
  });
});

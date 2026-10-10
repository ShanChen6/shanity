import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_ROUTES, isPageRoute } from "./breadcrumbs";
import {
  accountNav,
  activeNavItem,
  adminNav,
  blogNavItem,
  footerNav,
  instructorNav,
  isNavActive,
  learnerHeaderNav,
  navigationFor,
  portals,
  portalsFor,
  publicHeaderNav,
  quickActions,
  searchableNavigation,
  studentNav,
  userMenuNav,
  type NavItem,
} from "./navigation.config";

/** URLs served by a page.tsx under src/app, as the router sees them. */
function servedRoutes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const { name } = entry;
        if (name.startsWith("@") || name.startsWith("_")) continue;
        // (group) folders organise files but are not part of the URL.
        const isGroup = /^\(.*\)$/.test(name);
        walk(join(dir, name), isGroup ? segments : [...segments, name]);
      } else if (/^page\.[jt]sx?$/.test(entry.name))
        found.push(`/${segments.join("/")}`);
    }
  };
  walk(join(process.cwd(), "src/app"), []);
  return found.sort();
}

const allNavigation: NavItem[] = [
  ...studentNav,
  ...instructorNav,
  ...adminNav,
  ...accountNav,
  ...quickActions,
  ...publicHeaderNav,
  ...learnerHeaderNav,
  ...userMenuNav,
  blogNavItem,
];

describe("navigation targets", () => {
  it("only link to pages that exist", () => {
    const hrefs = [
      ...allNavigation.map((item) => item.href),
      ...portals.map((portal) => portal.href),
      "/admin/orders", // the finance officer's portal landing
      ...footerNav.flatMap((group) => group.links.map((link) => link.href)),
    ];
    for (const href of hrefs)
      expect(isPageRoute(href), `no page serves ${href}`).toBe(true);
  });

  it("keeps PAGE_ROUTES identical to the pages under src/app", () => {
    // Add the new route to config/breadcrumbs.ts (or drop the removed one).
    expect([...PAGE_ROUTES].sort()).toEqual(servedRoutes());
  });

  it("has no duplicate hrefs within one menu", () => {
    for (const menu of [
      studentNav,
      instructorNav,
      adminNav,
      publicHeaderNav,
      learnerHeaderNav,
      userMenuNav,
    ]) {
      const hrefs = menu.map((item) => item.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});

describe("header and user menu", () => {
  it("keep every learner page reachable from one or the other", () => {
    const reachable = new Set(
      [...learnerHeaderNav, ...userMenuNav].map((item) => item.href),
    );
    for (const item of studentNav)
      expect(reachable.has(item.href), `${item.href} is unreachable`).toBe(
        true,
      );
  });

  it("only show visitors pages that need no account", () => {
    expect(publicHeaderNav.map((item) => item.href)).toEqual([
      "/courses",
      "/blog",
    ]);
  });
});

describe("navigationFor", () => {
  it("gives finance officers only the order console", () => {
    expect(
      navigationFor(adminNav, ["finance_officer"]).map((item) => item.href),
    ).toEqual(["/admin/orders"]);
  });

  it("gives admins every admin module and no instructor ones", () => {
    expect(navigationFor(adminNav, ["admin"])).toHaveLength(adminNav.length);
    expect(navigationFor(instructorNav, ["admin"])).toEqual([]);
  });

  it("shows the instructor menu to instructors only", () => {
    expect(navigationFor(instructorNav, ["student"])).toEqual([]);
    expect(navigationFor(instructorNav, ["instructor"])).toHaveLength(
      instructorNav.length,
    );
  });

  it("shows the learner menu to any signed-in role", () => {
    for (const role of ["student", "instructor", "admin"] as const)
      expect(navigationFor(studentNav, [role])).toHaveLength(studentNav.length);
  });
});

describe("isNavActive / activeNavItem", () => {
  const dashboard = studentNav[0]!;
  const courses = studentNav.find((item) => item.href === "/courses")!;
  const orders = studentNav.find((item) => item.href === "/account/orders")!;

  it("matches exactly where a path is a prefix of its siblings", () => {
    expect(isNavActive("/dashboard", dashboard)).toBe(true);
    expect(isNavActive("/dashboard/anything", dashboard)).toBe(false);
    const admin = adminNav[0]!;
    expect(isNavActive("/admin", admin)).toBe(true);
    expect(isNavActive("/admin/users", admin)).toBe(false);
  });

  it("matches a section and everything under it, but not look-alikes", () => {
    expect(isNavActive("/courses", courses)).toBe(true);
    expect(isNavActive("/courses/javascript", courses)).toBe(true);
    expect(isNavActive("/courses-archive", courses)).toBe(false);
  });

  it("keeps renamed routes highlighted through their aliases", () => {
    expect(isNavActive("/orders", orders)).toBe(true);
    expect(isNavActive("/checkout/ABC", orders)).toBe(true);
    const attempts = studentNav.find((item) => item.href === "/quiz-attempts")!;
    expect(isNavActive("/my-quiz-attempts", attempts)).toBe(true);
  });

  it("prefers the most specific item", () => {
    const items: NavItem[] = [
      { href: "/instructor", label: "A", icon: "grid" },
      { href: "/instructor/courses", label: "B", icon: "grid" },
    ];
    expect(activeNavItem("/instructor/courses/new", items)?.label).toBe("B");
    expect(activeNavItem("/elsewhere", items)).toBeUndefined();
  });
});

describe("portalsFor", () => {
  it("always offers the learner space", () => {
    expect(portalsFor(["student"]).map((portal) => portal.id)).toEqual([
      "student",
    ]);
  });

  it("adds instructor and admin spaces by role", () => {
    expect(
      portalsFor(["student", "instructor", "admin"]).map((portal) => portal.id),
    ).toEqual(["student", "instructor", "admin"]);
  });

  it("sends finance officers to the order console, not the admin overview", () => {
    const admin = portalsFor(["finance_officer"]).find(
      (portal) => portal.id === "admin",
    );
    expect(admin?.href).toBe("/admin/orders");
    expect(
      portalsFor(["admin"]).find((portal) => portal.id === "admin")?.href,
    ).toBe("/admin");
  });
});

describe("searchableNavigation", () => {
  it("is role filtered and free of duplicates", () => {
    const student = searchableNavigation(["student"]).map((i) => i.href);
    expect(student).toContain("/courses");
    expect(student).not.toContain("/instructor/grading");
    expect(student).not.toContain("/admin/users");
    const staff = searchableNavigation(["student", "instructor", "admin"]).map(
      (i) => i.href,
    );
    expect(staff).toContain("/instructor/courses/new");
    expect(staff).toContain("/admin/settings");
    expect(new Set(staff).size).toBe(staff.length);
  });
});

import { describe, expect, it } from "vitest";
import { breadcrumbsFor, isPageRoute } from "./breadcrumbs";

const trail = (path: string, overrides?: Record<string, string>) =>
  breadcrumbsFor(path, overrides).map(({ label, href, current, linkable }) => ({
    label,
    href,
    current,
    linkable,
  }));

describe("breadcrumbsFor", () => {
  it("is empty at the site root", () => {
    expect(breadcrumbsFor("/")).toEqual([]);
  });

  it("labels static segments and marks only the last one current", () => {
    expect(trail("/admin/users")).toEqual([
      { label: "Quản trị", href: "/admin", current: false, linkable: true },
      {
        label: "Người dùng",
        href: "/admin/users",
        current: true,
        linkable: false,
      },
    ]);
  });

  it("names a dynamic segment after what it belongs to", () => {
    const [, , detail] = trail("/admin/users/6b0c6a5e");
    expect(detail?.label).toBe("Chi tiết người dùng");
    expect(trail("/courses/javascript-co-ban")[1]?.label).toBe(
      "Chi tiết khóa học",
    );
  });

  it("falls back to a generic label for unknown parents", () => {
    expect(trail("/something/abc")[1]?.label).toBe("Chi tiết");
  });

  it("lets a page supply the real title", () => {
    const crumbs = trail("/courses/js", { "/courses/js": "JavaScript cơ bản" });
    expect(crumbs[1]?.label).toBe("JavaScript cơ bản");
  });

  it("never links a level that has no page", () => {
    // /instructor/courses/[id] has no index page, only /edit, /preview, ...
    const crumbs = trail("/instructor/courses/abc/edit/basic");
    const byHref = Object.fromEntries(crumbs.map((c) => [c.href, c]));
    expect(byHref["/instructor/courses/abc"]?.linkable).toBe(false);
    expect(byHref["/instructor/courses"]?.linkable).toBe(true);
    expect(byHref["/instructor/courses/abc/edit"]?.linkable).toBe(true);
    expect(byHref["/instructor/courses/abc/edit/basic"]?.current).toBe(true);
  });

  it("ignores a query string", () => {
    expect(trail("/admin/users?page=2")).toHaveLength(2);
  });
});

describe("isPageRoute", () => {
  it("matches dynamic segments but not extra depth", () => {
    expect(isPageRoute("/courses/anything")).toBe(true);
    expect(isPageRoute("/courses/anything/deeper")).toBe(false);
    expect(isPageRoute("/nope")).toBe(false);
  });
});

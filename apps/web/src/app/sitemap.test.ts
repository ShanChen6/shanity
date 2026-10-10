import { describe, expect, it, vi } from "vitest";

const posts = vi.hoisted(() => ({
  load: vi.fn(async () => [
    { slug: "dao-ham", updatedAt: "2026-10-02T08:00:00.000Z" },
  ]),
}));
vi.mock("@/features/blog/server", () => ({ fetchBlogSitemap: posts.load }));

const { default: sitemap } = await import("./sitemap");
const { default: robots } = await import("./robots");

describe("sitemap.xml", () => {
  it("lists the public pages and every published post", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "http://localhost:3000/",
        "http://localhost:3000/blog",
        "http://localhost:3000/courses",
        "http://localhost:3000/blog/dao-ham",
      ]),
    );
    expect(entries.find((e) => e.url.endsWith("/blog/dao-ham"))?.lastModified).toEqual(
      new Date("2026-10-02T08:00:00.000Z"),
    );
  });

  it("still answers without posts when the API is down", async () => {
    posts.load.mockRejectedValueOnce(new Error("down"));
    expect((await sitemap()).map((e) => e.url)).toContain("http://localhost:3000/blog");
  });

  it("is announced by robots.txt, which keeps crawlers out of private areas", () => {
    const rules = robots();
    expect(rules.sitemap).toBe("http://localhost:3000/sitemap.xml");
    expect(rules.rules).toMatchObject({ allow: "/" });
    expect(JSON.stringify(rules.rules)).toContain("/admin");
  });
});

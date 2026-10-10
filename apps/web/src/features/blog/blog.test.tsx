import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/config/site.config";
import {
  ArticleMarkdown,
  anchorId,
  isExternal,
  normalizeDisplayMath,
} from "./article-markdown";
import { RelatedCourseCard, priceLabel } from "./blog-cards";
import { titleSize } from "./og";
import {
  articleJsonLd,
  blogListHref,
  ogImageUrl,
  serializeJsonLd,
} from "./seo";
import { toBlogList } from "./blog-list";
import type { BlogPostFull, RelatedCourse } from "./types";

const post: BlogPostFull = {
  id: "p1",
  title: "Đạo hàm cho người mới",
  slug: "dao-ham-cho-nguoi-moi",
  excerpt: "Hiểu đạo hàm qua ví dụ.",
  coverImage: null,
  category: { name: "Toán học", slug: "toan-hoc" },
  author: { name: "Cô Lan", avatarUrl: null },
  publishedAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-02T08:00:00.000Z",
  readingMinutes: 4,
  content: "",
};

describe("SEO helpers", () => {
  it("builds BlogPosting and BreadcrumbList structured data", () => {
    const [article, breadcrumb] = articleJsonLd(post);
    expect(article).toMatchObject({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: { "@type": "Person", name: "Cô Lan" },
      publisher: { "@type": "Organization", name: "Shanity" },
      articleSection: "Toán học",
      url: "http://localhost:3000/blog/dao-ham-cho-nguoi-moi",
      image: [ogImageUrl(post.slug)],
    });
    expect(breadcrumb).toMatchObject({ "@type": "BreadcrumbList" });
  });

  it("never lets post text close the JSON-LD script tag", () => {
    const json = serializeJsonLd({ headline: "</script><script>alert(1)" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ headline: "</script><script>alert(1)" });
  });

  it("draws OG images from the slug only", () => {
    expect(ogImageUrl("a-b")).toBe("http://localhost:3000/api/og?slug=a-b");
    expect(ogImageUrl()).toBe("http://localhost:3000/api/og");
    expect(titleSize("x".repeat(40))).toBeGreaterThan(titleSize("x".repeat(100)));
  });

  it("keeps canonical list URLs free of defaults", () => {
    expect(blogListHref()).toBe("/blog");
    expect(blogListHref(undefined, 1)).toBe("/blog");
    expect(blogListHref("toan-hoc", 2)).toBe("/blog?category=toan-hoc&page=2");
  });

  it("accepts only a bare http(s) origin as the site URL", () => {
    expect(resolveSiteUrl("https://shanity.vn")).toBe("https://shanity.vn");
    expect(resolveSiteUrl("https://shanity.vn/")).toBe("https://shanity.vn");
    for (const bad of [undefined, "", "javascript:alert(1)", "https://x.vn/blog", "ftp://x.vn"])
      expect(resolveSiteUrl(bad)).toBe("http://localhost:3000");
  });
});

describe("ArticleMarkdown", () => {
  it("renders headings with anchors and keeps one h1 per page", () => {
    const { container } = render(
      <ArticleMarkdown content={"# Mở đầu\n\n## Đạo hàm là gì?\n\nNội dung"} />,
    );
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByRole("heading", { name: "Mở đầu" }).tagName).toBe("H2");
    expect(screen.getByRole("heading", { name: "Đạo hàm là gì?" })).toHaveAttribute(
      "id",
      "dao-ham-la-gi",
    );
  });

  it("renders inline and display math with KaTeX", () => {
    const { container } = render(
      <ArticleMarkdown content={"Ta có $f'(x) = 2x$ và\n\n$$\\int_0^1 x\\,dx = \\frac{1}{2}$$"} />,
    );
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("treats a line of $$...$$ as display math, but not inside code", () => {
    expect(normalizeDisplayMath("a\n$$x^2$$\nb")).toBe("a\n$$\nx^2\n$$\nb");
    expect(normalizeDisplayMath("giá $$5 và $$6")).toBe("giá $$5 và $$6");
    const code = "```bash\necho $$\n$$x$$\n```";
    expect(normalizeDisplayMath(code)).toBe(code);
  });

  it("does not render raw HTML or script links", () => {
    const { container } = render(
      <ArticleMarkdown
        content={'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bấm](javascript:alert(1))'}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    const link = screen.getByText("bấm").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("marks outbound links nofollow and keeps internal ones plain", () => {
    render(
      <ArticleMarkdown content={"[MDN](https://developer.mozilla.org) và [khóa học](/courses)"} />,
    );
    expect(screen.getByRole("link", { name: "MDN" })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "khóa học" })).not.toHaveAttribute("rel");
    expect(isExternal("http://localhost:3000/x")).toBe(false);
    expect(anchorId("!!!")).toBe("muc");
  });
});

describe("RelatedCourseCard", () => {
  const course: RelatedCourse = {
    id: "c1",
    title: "Giải tích 1",
    slug: "giai-tich-1",
    shortDescription: "Nắm chắc nền tảng.",
    thumbnail: null,
    accessType: "PAID",
    price: 499000,
    currency: "VND",
    instructorName: "Cô Lan",
  };

  it("shows the price and links to the course with the article as referrer", () => {
    render(<RelatedCourseCard course={course} postSlug="dao-ham" />);
    expect(screen.getByText("Khóa học liên quan")).toBeInTheDocument();
    expect(screen.getByText("499.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem khóa học/ })).toHaveAttribute(
      "href",
      "/courses/giai-tich-1?ref=blog%3Adao-ham",
    );
  });

  it("labels free courses", () => {
    expect(priceLabel({ ...course, accessType: "FREE", price: 0 })).toBe("Miễn phí");
  });
});

describe("toBlogList", () => {
  it("reads the /api/v1 list envelope (rows in data, pagination in meta)", () => {
    const meta = { page: 2, limit: 12, total: 13, totalPages: 2 };
    expect(toBlogList({ success: true, data: [post], meta })).toEqual({
      items: [post],
      ...meta,
    });
  });

  it("refuses anything else", () => {
    for (const body of [null, { items: [post] }, { data: [post] }])
      expect(() => toBlogList(body)).toThrow("Dữ liệu bài viết không hợp lệ.");
  });
});

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/site.config";
import { blogPostPath } from "@/features/blog/seo";
import { fetchBlogSitemap } from "@/features/blog/server";

// Built per request: new posts appear without a redeploy.
export const dynamic = "force-dynamic";

const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
  { url: absoluteUrl("/courses"), changeFrequency: "daily", priority: 0.9 },
  { url: absoluteUrl("/blog"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/legal/terms"), changeFrequency: "yearly", priority: 0.2 },
  { url: absoluteUrl("/legal/privacy"), changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A sitemap without posts beats no sitemap while the API is down.
  const posts = await fetchBlogSitemap().catch(() => []);
  return [
    ...STATIC_PAGES,
    ...posts.map((post) => ({
      url: absoluteUrl(blogPostPath(post.slug)),
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}

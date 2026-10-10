import { BRAND } from "@/config/brand.config";
import { absoluteUrl } from "@/config/site.config";
import type { BlogPostFull } from "./types";

export const blogPostPath = (slug: string) =>
  `/blog/${encodeURIComponent(slug)}`;

/** /blog?category=x&page=2 without defaults: the list's canonical URL. */
export function blogListHref(category?: string, page = 1) {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/blog?${search}` : "/blog";
}

/**
 * The post's share image. Only the slug travels in the URL: the image is
 * drawn from the stored post, so nobody can mint branded images that say
 * whatever they like.
 */
export const ogImageUrl = (slug?: string) =>
  absoluteUrl(slug ? `/api/og?slug=${encodeURIComponent(slug)}` : "/api/og");

/** schema.org BlogPosting plus its breadcrumb trail, for rich results. */
export function articleJsonLd(post: BlogPostFull) {
  const url = absoluteUrl(blogPostPath(post.slug));
  const images = [
    ogImageUrl(post.slug),
    ...(post.coverImage && /^https?:\/\//.test(post.coverImage)
      ? [post.coverImage]
      : []),
  ];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title.slice(0, 110),
      description: post.excerpt,
      image: images,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      inLanguage: "vi-VN",
      author: { "@type": "Person", name: post.author.name },
      publisher: {
        "@type": "Organization",
        name: BRAND.name,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl(BRAND.assets.icon.src),
        },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      ...(post.category ? { articleSection: post.category.name } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang chủ", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Blog", item: absoluteUrl("/blog") },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
}

/**
 * JSON for a <script type="application/ld+json">. `<` is escaped so text in
 * a post ("</script>…") can never close the tag (Next's JSON-LD guide).
 */
export const serializeJsonLd = (data: unknown) =>
  JSON.stringify(data).replace(/</g, "\\u003c");

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BreadcrumbLabel } from "@/components/layout/breadcrumbs";
import { SiteShell } from "@/components/layout/site-shell";
import { ArticleMarkdown } from "@/features/blog/article-markdown";
import { BlogCommentSection } from "@/features/blog/comments/BlogCommentSection";
import { PostMeta, RelatedCourseCard } from "@/features/blog/blog-cards";
import {
  articleJsonLd,
  blogListHref,
  blogPostPath,
  ogImageUrl,
  serializeJsonLd,
} from "@/features/blog/seo";
import { fetchBlogPost } from "@/features/blog/server";

// One API call per request, shared by generateMetadata and the page.
const loadPost = cache(fetchBlogPost);

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPost(slug);
  if (!page) return { title: "Không tìm thấy bài viết | Shanity" };
  const { post } = page;
  const image = { url: ogImageUrl(post.slug), width: 1200, height: 630, alt: post.title };
  return {
    title: `${post.title} | Blog Shanity`,
    description: post.excerpt,
    alternates: { canonical: blogPostPath(post.slug) },
    authors: [{ name: post.author.name }],
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: blogPostPath(post.slug),
      siteName: "Shanity",
      locale: "vi_VN",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      ...(post.category ? { section: post.category.name } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [image.url],
    },
  };
}

export default async function BlogPostPage({
  params,
}: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const page = await loadPost(slug);
  if (!page) notFound();
  const { post, relatedCourse } = page;

  return (
    <SiteShell>
      <BreadcrumbLabel href={blogPostPath(post.slug)} label={post.title} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd(post)) }}
      />
      <main className="flex-1">
        <div className="container grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-12">
          <article className="min-w-0 max-w-3xl">
            <header className="space-y-4 border-b border-border pb-6">
              {post.category && (
                <Link
                  href={blogListHref(post.category.slug)}
                  className="text-sm font-semibold uppercase tracking-wide text-primary hover:underline"
                >
                  {post.category.name}
                </Link>
              )}
              <h1 className="font-heading text-h1 font-bold leading-tight">
                {post.title}
              </h1>
              <p className="text-body-lg text-foreground-secondary">{post.excerpt}</p>
              <PostMeta post={post} />
            </header>
            <ArticleMarkdown content={post.content} />
            <BlogCommentSection slug={post.slug} />
          </article>
          {relatedCourse && (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <RelatedCourseCard course={relatedCourse} postSlug={post.slug} />
            </div>
          )}
        </div>
      </main>
    </SiteShell>
  );
}

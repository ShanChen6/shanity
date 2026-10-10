import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { PostCard } from "@/features/blog/blog-cards";
import { WriteLink } from "@/features/blog/authoring/WriteLink";
import { blogListHref, ogImageUrl } from "@/features/blog/seo";
import { fetchBlogCategories, fetchBlogList } from "@/features/blog/server";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
const parsePage = (value: string | undefined) => {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1;
};
const parseCategory = (value: string | undefined) =>
  value && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) ? value : undefined;

const DESCRIPTION =
  "Bài viết kỹ thuật từ giảng viên Shanity: lập trình, toán học và kinh nghiệm học tập.";

export async function generateMetadata({
  searchParams,
}: PageProps<"/blog">): Promise<Metadata> {
  const params = (await searchParams) as SearchParams;
  const category = parseCategory(first(params.category));
  const page = parsePage(first(params.page));
  const categories = category ? await fetchBlogCategories() : [];
  const name = categories.find((item) => item.slug === category)?.name;
  const title = [name ? `Blog: ${name}` : "Blog công nghệ", page > 1 && `Trang ${page}`]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${title} | Shanity`,
    description: DESCRIPTION,
    alternates: { canonical: blogListHref(category, page) },
    openGraph: {
      type: "website",
      title,
      description: DESCRIPTION,
      url: blogListHref(category, page),
      images: [{ url: ogImageUrl(), width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, images: [ogImageUrl()] },
  };
}

export default async function BlogPage({ searchParams }: PageProps<"/blog">) {
  const params = (await searchParams) as SearchParams;
  const category = parseCategory(first(params.category));
  const page = parsePage(first(params.page));
  const [list, categories] = await Promise.all([
    fetchBlogList(page, category),
    fetchBlogCategories(),
  ]);

  return (
    <SiteShell>
      <main className="flex-1">
        <section className="border-b border-border bg-surface-secondary">
          <div className="container py-10 sm:py-14">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="font-heading text-h1 font-bold">Blog công nghệ</h1>
              <WriteLink />
            </div>
            <p className="mt-3 max-w-2xl text-body-lg text-foreground-secondary">
              {DESCRIPTION}
            </p>
            {categories.length > 0 && (
              <nav aria-label="Chủ đề" className="mt-6 flex flex-wrap gap-2">
                {[{ slug: undefined, name: "Tất cả" }, ...categories].map((item) => {
                  const active = item.slug === category;
                  return (
                    <Link
                      key={item.slug ?? "all"}
                      href={blogListHref(item.slug)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium",
                        active
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border-strong bg-surface hover:bg-surface-hover",
                      )}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </section>

        <div className="container py-10">
          {list.items.length === 0 ? (
            <p className="py-16 text-center text-muted">
              Chưa có bài viết nào{category ? " trong chủ đề này" : ""}.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {list.totalPages > 1 && (
            <nav
              aria-label="Phân trang"
              className="mt-10 flex items-center justify-center gap-4 text-sm"
            >
              {page > 1 ? (
                <Link rel="prev" href={blogListHref(category, page - 1)} className="font-semibold text-primary underline">
                  ← Mới hơn
                </Link>
              ) : (
                <span className="text-muted">← Mới hơn</span>
              )}
              <span>
                Trang {page}/{list.totalPages}
              </span>
              {page < list.totalPages ? (
                <Link rel="next" href={blogListHref(category, page + 1)} className="font-semibold text-primary underline">
                  Cũ hơn →
                </Link>
              ) : (
                <span className="text-muted">Cũ hơn →</span>
              )}
            </nav>
          )}
        </div>
      </main>
    </SiteShell>
  );
}

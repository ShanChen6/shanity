import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { formatMoney } from "@/features/payments/format";
import { cn } from "@/lib/utils";
import { CatalogThumbnail } from "@/features/courses/catalog-thumbnail";
import { blogImageUrl } from "./image-url";
import { blogPostPath } from "./seo";
import type { BlogPostCard, RelatedCourse } from "./types";

const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" });
export const publishedDate = (iso: string) => date.format(new Date(iso));

/** Byline facts shared by cards and the article header. */
export function PostMeta({
  post,
  className,
}: {
  post: Pick<BlogPostCard, "author" | "publishedAt" | "readingMinutes">;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 text-sm text-muted", className)}>
      <span className="font-medium text-foreground-secondary">
        {post.author.name}
      </span>
      <span aria-hidden="true">·</span>
      <time dateTime={post.publishedAt}>{publishedDate(post.publishedAt)}</time>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" aria-hidden="true" />
        {post.readingMinutes} phút đọc
      </span>
    </p>
  );
}

export function PostCard({
  post,
  headingLevel: Heading = "h2",
}: {
  post: BlogPostCard;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <CatalogThumbnail
        source={post.coverImage ? blogImageUrl(post.coverImage) : null}
        title={post.title}
        badge={null}
      />
      <div className="flex flex-1 flex-col gap-3 p-5">
        {post.category && (
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            {post.category.name}
          </span>
        )}
        <Heading className="font-heading text-h4 font-semibold leading-snug">
          {/* The whole card is the link (stretched), the title its name. */}
          <Link
            href={blogPostPath(post.slug)}
            className="after:absolute after:inset-0 group-hover:text-primary"
          >
            {post.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-sm text-foreground-secondary">
          {post.excerpt}
        </p>
        <PostMeta post={post} className="mt-auto pt-2" />
      </div>
    </article>
  );
}

export const priceLabel = (course: Pick<RelatedCourse, "accessType" | "price" | "currency">) =>
  course.accessType === "FREE" || course.price === 0
    ? "Miễn phí"
    : formatMoney(course.price, course.currency);

/** "Khóa học liên quan": the course this post leads to, as a sales card. */
export function RelatedCourseCard({
  course,
  postSlug,
}: {
  course: RelatedCourse;
  postSlug: string;
}) {
  // Attribution for the course page: which article sent the visitor.
  const href = `/courses/${encodeURIComponent(course.slug)}?ref=${encodeURIComponent(
    `blog:${postSlug}`,
  )}`;
  return (
    <aside
      aria-labelledby="related-course-title"
      className="overflow-hidden rounded-xl border border-primary/30 bg-surface shadow-sm"
      data-testid="related-course"
    >
      <p className="bg-secondary px-5 py-2 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
        Khóa học liên quan
      </p>
      <CatalogThumbnail source={course.thumbnail} title={course.title} badge={null} />
      <div className="space-y-3 p-5">
        <h2 id="related-course-title" className="font-heading text-h4 font-semibold leading-snug">
          {course.title}
        </h2>
        {course.shortDescription && (
          <p className="line-clamp-3 text-sm text-foreground-secondary">
            {course.shortDescription}
          </p>
        )}
        {course.instructorName && (
          <p className="text-sm text-muted">Giảng viên: {course.instructorName}</p>
        )}
        <p className="text-h4 font-bold text-primary">{priceLabel(course)}</p>
        <Link
          href={href}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Xem khóa học
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}

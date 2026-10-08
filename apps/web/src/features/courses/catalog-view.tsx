import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { API_URL } from "@/lib/api";
import { CatalogControls } from "./catalog-controls";
import { CatalogThumbnail } from "./catalog-thumbnail";
import { catalogHref } from "./catalog-types";
import type {
  CatalogCourse,
  CatalogFilters,
  CourseCatalogResponse,
} from "./catalog-types";

function avatarSource(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function CourseCard({ course }: { course: CatalogCourse }) {
  const date = course.publishedAt
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(course.publishedAt))
    : "Đang cập nhật";
  const instructor = course.instructor;

  return (
    <Link
      href={`/courses/${encodeURIComponent(course.slug)}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition duration-normal hover:-translate-y-0.5 hover:border-emerald-700/40 hover:shadow-md focus-visible:outline-offset-4"
      aria-label={`Xem khóa học ${course.title}`}
    >
      <CatalogThumbnail source={course.thumbnail} title={course.title} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h2 className="line-clamp-2 min-h-12 break-words font-heading text-h4 font-semibold leading-snug transition-colors group-hover:text-primary">
          {course.title}
        </h2>
        <p className="mt-2 line-clamp-2 min-h-11 text-body-sm text-muted">
          {course.shortDescription ||
            "Khám phá nội dung và bắt đầu học theo nhịp của bạn."}
        </p>
        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
          <Avatar
            name={instructor?.displayName || "Giảng viên Shanity"}
            src={
              instructor?.avatar ? avatarSource(instructor.avatar) : undefined
            }
            unoptimized
            className="size-9 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          >
            {instructor?.avatar && (
              <AvatarImage src={avatarSource(instructor.avatar)} />
            )}
            <AvatarFallback />
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted">Giảng viên</p>
            <p className="truncate text-body-sm font-semibold text-foreground">
              {instructor?.displayName || "Đội ngũ Shanity"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-caption text-muted">Xuất bản</p>
            <time
              className="text-body-sm font-medium text-foreground-secondary"
              dateTime={course.publishedAt ?? undefined}
            >
              {date}
            </time>
          </div>
        </div>
        <span className="mt-4 inline-flex items-center gap-2 text-body-sm font-semibold text-primary">
          Xem khóa học
          <Icon
            name="arrow"
            className="size-4 transition-transform duration-normal group-hover:translate-x-1"
          />
        </span>
      </div>
    </Link>
  );
}

function pageWindow(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from(
    { length: Math.max(0, end - start + 1) },
    (_, i) => start + i,
  );
}

function CatalogPagination({
  filters,
  totalPages,
}: {
  filters: CatalogFilters;
  totalPages: number;
}) {
  if (totalPages < 2) return null;
  const pages = pageWindow(filters.page, totalPages);

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-border pt-6"
      aria-label="Phân trang khóa học"
    >
      <Link
        href={catalogHref(filters, filters.page - 1)}
        aria-disabled={filters.page <= 1}
        tabIndex={filters.page <= 1 ? -1 : undefined}
        className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition-colors hover:bg-surface-hover ${filters.page <= 1 ? "pointer-events-none opacity-45" : ""}`}
      >
        <Icon name="arrowLeft" className="size-4" />
        <span className="hidden sm:inline">Trước</span>
      </Link>
      {pages.map((page) => (
        <Link
          key={page}
          href={catalogHref(filters, page)}
          aria-current={page === filters.page ? "page" : undefined}
          className={`inline-flex size-10 items-center justify-center rounded-md border text-sm font-semibold transition-colors ${
            page === filters.page
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-foreground hover:bg-surface-hover"
          }`}
        >
          {page}
        </Link>
      ))}
      <Link
        href={catalogHref(filters, filters.page + 1)}
        aria-disabled={filters.page >= totalPages}
        tabIndex={filters.page >= totalPages ? -1 : undefined}
        className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition-colors hover:bg-surface-hover ${filters.page >= totalPages ? "pointer-events-none opacity-45" : ""}`}
      >
        <span className="hidden sm:inline">Tiếp</span>
        <Icon name="arrow" className="size-4" />
      </Link>
    </nav>
  );
}

function EmptyCatalog() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center px-5 py-16 text-center sm:py-20">
      <span className="flex size-14 items-center justify-center rounded-full bg-warning-background text-warning">
        <Icon name="search" className="size-6" />
      </span>
      <h2 className="mt-5 font-heading text-h3 font-semibold">
        Chưa tìm thấy khóa học phù hợp
      </h2>
      <p className="mt-2 text-body-sm text-muted">
        Hãy thử từ khóa khác hoặc xem lại toàn bộ danh mục.
      </p>
      <Link
        href="/courses"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Xóa bộ lọc
      </Link>
    </section>
  );
}

export function CourseCatalog({
  catalog,
  filters,
}: {
  catalog: CourseCatalogResponse;
  filters: CatalogFilters;
}) {
  return (
    <SiteShell>
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border bg-surface-secondary">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 border-l border-emerald-900/10 bg-[repeating-linear-gradient(135deg,transparent_0_20px,color-mix(in_oklab,var(--success)_8%,transparent)_20px_21px,transparent_21px_42px)] lg:block" />
          <div className="container relative py-9 sm:py-12">
            <p className="text-caption font-bold uppercase text-emerald-800 dark:text-emerald-300">
              Shanity · Thư viện học tập
            </p>
            <div className="mt-3 flex flex-col gap-3 lg:max-w-3xl">
              <h1 className="font-heading text-h1 font-semibold">
                Khám phá khóa học
              </h1>
              <p className="max-w-2xl text-body text-foreground-secondary">
                Tìm chủ đề mới, chọn nhịp học phù hợp và bắt đầu hành trình tiếp
                theo.
              </p>
            </div>
          </div>
        </section>

        <section className="container py-7 sm:py-9">
          <CatalogControls key={filters.search} filters={filters} />
          <div className="mb-4 mt-7 flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 className="font-heading text-h4 font-semibold">
              Danh mục khóa học
            </h2>
            <p className="text-body-sm text-muted" aria-live="polite">
              {new Intl.NumberFormat("vi-VN").format(catalog.total)} khóa học
            </p>
          </div>

          {catalog.data.length ? (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {catalog.data.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
              <CatalogPagination
                filters={filters}
                totalPages={catalog.totalPages}
              />
            </>
          ) : (
            <EmptyCatalog />
          )}
        </section>
      </main>
    </SiteShell>
  );
}

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { API_URL } from "@/lib/api";
import { SiteShell } from "@/components/layout/site-shell";
import { CatalogThumbnail } from "./catalog-thumbnail";
import { CourseCta } from "./course-cta";

export type PublicCourseDetail = {
  course: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    thumbnail: string | null;
    publishedAt: string | null;
    accessType: "FREE" | "PAID";
    /** Minor units: VND dong / USD cents. */
    price: number;
    currency: string;
  };
  instructor: {
    id: string;
    displayName: string;
    avatar: string | null;
    bio: string | null;
  } | null;
  curriculum: {
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
  }[];
};

function avatarSource(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function publishedDate(value: string | null) {
  if (!value) return "Đã xuất bản";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function PublicCourseDetailView({
  detail,
}: {
  detail: PublicCourseDetail;
}) {
  const { course, instructor, curriculum } = detail;
  const curriculumLabel = `${curriculum.length} chương học`;

  return (
    <SiteShell>
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border bg-surface-secondary">
          <div className="absolute inset-y-0 right-0 hidden w-[38%] border-l border-border bg-[repeating-linear-gradient(135deg,transparent_0_22px,color-mix(in_oklab,var(--brand-teal)_10%,transparent)_22px_23px,transparent_23px_46px)] lg:block" />
          <div className="container relative py-8 sm:py-11">
            <nav
              aria-label="Đường dẫn"
              className="mb-5 flex items-center gap-2 text-body-sm text-muted"
            >
              <Link
                href="/courses"
                className="transition-colors hover:text-primary"
              >
                Khóa học
              </Link>
              <Icon name="chevronRight" className="size-4" />
              <span
                aria-current="page"
                className="max-w-[60vw] truncate text-foreground-secondary"
              >
                {course.title}
              </span>
            </nav>
            <div className="max-w-4xl">
              <p className="text-caption font-bold uppercase text-primary">
                Khóa học công khai
              </p>
              <h1 className="mt-3 break-words font-heading text-h1 font-semibold">
                {course.title}
              </h1>
              {course.shortDescription && (
                <p className="mt-3 max-w-3xl text-body-lg text-foreground-secondary">
                  {course.shortDescription}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={instructor?.displayName || "Giảng viên Shanity"}
                    src={
                      instructor?.avatar
                        ? avatarSource(instructor.avatar)
                        : undefined
                    }
                    unoptimized
                    className="size-11 border border-border bg-accent text-accent-foreground"
                  >
                    {instructor?.avatar && (
                      <AvatarImage src={avatarSource(instructor.avatar)} />
                    )}
                    <AvatarFallback />
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-caption text-muted">Giảng viên</p>
                    <p className="truncate text-body-sm font-semibold">
                      {instructor?.displayName || "Đội ngũ Shanity"}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-body-sm text-foreground-secondary">
                  <Icon name="calendar" className="size-4 text-muted" />
                  Xuất bản {publishedDate(course.publishedAt)}
                </span>
                <span className="inline-flex items-center gap-2 text-body-sm text-foreground-secondary">
                  <Icon name="book" className="size-4 text-muted" />
                  {curriculumLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="container grid grid-cols-1 items-start gap-8 py-7 sm:py-9 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
          <div className="order-2 min-w-0 space-y-9 lg:order-1">
            <section aria-labelledby="overview-title">
              <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Icon name="info" className="size-5" />
                </span>
                <h2
                  id="overview-title"
                  className="font-heading text-h3 font-semibold"
                >
                  Giới thiệu khóa học
                </h2>
              </div>
              <p className="whitespace-pre-line break-words text-body text-foreground-secondary">
                {course.description ||
                  course.shortDescription ||
                  "Thông tin khóa học đang được cập nhật."}
              </p>
            </section>

            <section aria-labelledby="curriculum-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-caption font-bold uppercase text-primary">
                    Lộ trình học
                  </p>
                  <h2
                    id="curriculum-title"
                    className="mt-1 font-heading text-h3 font-semibold"
                  >
                    Nội dung khóa học
                  </h2>
                </div>
                <span className="rounded-sm bg-surface-secondary px-2.5 py-1 text-caption font-semibold text-foreground-secondary">
                  {curriculumLabel}
                </span>
              </div>
              {curriculum.length ? (
                <ol className="divide-y divide-border border-y border-border">
                  {curriculum.map((chapter, index) => (
                    <li
                      key={chapter.id}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-4"
                    >
                      <span className="flex size-9 items-center justify-center rounded-md bg-surface-secondary font-mono text-body-sm font-semibold text-muted sm:size-10">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <h3 className="break-words font-heading text-body font-semibold">
                          {chapter.title}
                        </h3>
                        {chapter.description && (
                          <p className="mt-1 whitespace-pre-line break-words text-body-sm text-muted">
                            {chapter.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-md border border-dashed border-border-strong bg-surface-secondary p-5 text-body-sm text-muted">
                  Đề cương khóa học đang được cập nhật.
                </p>
              )}
              <p className="mt-3 text-caption text-muted">
                Bài học chi tiết sẽ được mở trong khóa học.
              </p>
            </section>
          </div>

          <aside className="order-1 min-w-0 lg:sticky lg:top-6 lg:order-2">
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
              <CatalogThumbnail
                source={course.thumbnail}
                title={course.title}
              />
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-muted">Trạng thái</span>
                  <span className="inline-flex items-center gap-2 text-body-sm font-semibold text-success-foreground">
                    <span className="size-2 rounded-full bg-success" />
                    Đang mở
                  </span>
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <CourseCta course={course} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </SiteShell>
  );
}

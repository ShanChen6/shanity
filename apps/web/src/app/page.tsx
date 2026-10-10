import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/layout/site-shell";
import { Icon, type IconName } from "@/components/ui/icon";
import { BRAND } from "@/config/brand.config";
import { PostCard } from "@/features/blog/blog-cards";
import { fetchBlogList } from "@/features/blog/server";
import { CourseCard } from "@/features/courses/catalog-view";
import { fetchCatalog } from "@/features/courses/server";
import {
  HomeActions,
  HomeClosingCta,
  HomeResume,
} from "@/features/home/home-actions";

const DESCRIPTION =
  "Học qua video và tài liệu, làm bài kiểm tra, theo dõi tiến độ và trao đổi cùng giảng viên trong từng khóa học.";

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: DESCRIPTION,
  },
};

const FEATURES: ReadonlyArray<{
  icon: IconName;
  title: string;
  body: string;
}> = [
  {
    icon: "book",
    title: "Bài giảng video & tài liệu",
    body: "Mỗi khóa học chia thành bài ngắn: xem video, đọc tài liệu và học lại bất cứ lúc nào.",
  },
  {
    icon: "quiz",
    title: "Bài kiểm tra sau mỗi chặng",
    body: "Trắc nghiệm có kết quả ngay, câu tự luận được giảng viên chấm và nhận xét.",
  },
  {
    icon: "check",
    title: "Theo dõi tiến độ",
    body: "Biết mình đã học đến đâu và quay lại đúng bài đang dở chỉ với một lần bấm.",
  },
  {
    icon: "users",
    title: "Trao đổi trong khóa học",
    body: "Đặt câu hỏi và thảo luận cùng bạn học, giảng viên ngay trong phòng chat của khóa.",
  },
  {
    icon: "calendar",
    title: "Lớp học trực tiếp",
    body: "Lịch buổi học trực tiếp nằm cùng một chỗ, tham gia đúng giờ không cần tìm link.",
  },
  {
    icon: "bell",
    title: "Nhắc việc đang dở",
    body: "Chuông thông báo nhắc bạn bài kiểm tra còn làm dở và đơn hàng đang chờ thanh toán.",
  },
];

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Tạo tài khoản",
    body: "Đăng ký bằng email hoặc tài khoản Google.",
  },
  {
    title: "Chọn khóa học",
    body: "Xem giới thiệu, giáo trình và giảng viên trước khi ghi danh.",
  },
  {
    title: "Học và kiểm tra",
    body: "Học theo nhịp của bạn, làm bài kiểm tra và theo dõi tiến độ.",
  },
];

/** Newest courses and posts; a section is simply left out if the API is down. */
async function loadHighlights() {
  const [catalog, blog] = await Promise.all([
    fetchCatalog({
      page: 1,
      limit: 4,
      search: "",
      sortBy: "publishedAt",
      sortOrder: "DESC",
    }).catch(() => null),
    fetchBlogList(1).catch(() => null),
  ]);
  return {
    courses: catalog?.data.slice(0, 4) ?? [],
    courseTotal: catalog?.total ?? 0,
    catalogFailed: catalog === null,
    posts: blog?.items.slice(0, 3) ?? [],
  };
}

function SectionHeading({
  id,
  eyebrow,
  title,
  link,
}: {
  id: string;
  eyebrow: string;
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-caption font-bold uppercase text-primary">
          {eyebrow}
        </p>
        <h2 id={id} className="mt-2 font-heading text-h2 font-semibold">
          {title}
        </h2>
      </div>
      {link && (
        <Link
          href={link.href}
          className="inline-flex min-h-11 items-center gap-2 text-body-sm font-semibold text-primary hover:underline"
        >
          {link.label}
          <Icon name="arrow" className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Decorative: the learning loop the page describes, drawn as a lesson card. */
function HeroIllustration() {
  const lessons = [
    { label: "Video bài giảng", done: true },
    { label: "Tài liệu đọc thêm", done: true },
    { label: "Bài kiểm tra cuối chặng", done: false },
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 rounded-2xl bg-[repeating-linear-gradient(135deg,transparent_0_20px,color-mix(in_oklab,var(--brand-teal)_12%,transparent)_20px_21px,transparent_21px_42px)]" />
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-brand-teal to-brand-ink text-white">
          <span className="flex size-16 items-center justify-center rounded-full border border-white/40 bg-black/15 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="ml-1 size-7 fill-current">
              <path d="M7 4.5v15l12-7.5z" />
            </svg>
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <div className="flex items-center justify-between text-body-sm">
              <span className="font-semibold">Tiến độ chặng học</span>
              <span className="text-muted">2/3</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-secondary">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
          </div>
          <ul className="space-y-2">
            {lessons.map((lesson) => (
              <li
                key={lesson.label}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-body-sm"
              >
                <span
                  className={
                    lesson.done
                      ? "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex size-6 items-center justify-center rounded-full border border-border-strong text-muted"
                  }
                >
                  <Icon
                    name={lesson.done ? "check" : "quiz"}
                    className="size-3.5"
                  />
                </span>
                <span
                  className={
                    lesson.done ? "text-foreground-secondary" : "font-semibold"
                  }
                >
                  {lesson.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  const { courses, courseTotal, catalogFailed, posts } = await loadHighlights();

  return (
    <SiteShell breadcrumbs={false}>
      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="home-title"
          className="border-b border-border bg-surface-secondary"
        >
          <div className="container grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div>
              <p className="text-caption font-bold uppercase text-primary">
                {BRAND.name} · {BRAND.tagline}
              </p>
              <h1
                id="home-title"
                className="mt-4 max-w-2xl font-heading text-display font-semibold"
              >
                Học theo nhịp của bạn, tiến bộ mỗi ngày.
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-foreground-secondary">
                {DESCRIPTION}
              </p>
              <HomeActions className="mt-8" />
              {courseTotal > 0 && (
                <p className="mt-6 text-body-sm text-muted">
                  {new Intl.NumberFormat("vi-VN").format(courseTotal)} khóa học
                  đang mở ghi danh.
                </p>
              )}
              <HomeResume />
            </div>
            <HeroIllustration />
          </div>
        </section>

        {/* ── What you get ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="home-features"
          className="container py-16 sm:py-20"
        >
          <SectionHeading
            id="home-features"
            eyebrow="Trong mỗi khóa học"
            title="Mọi thứ cho một buổi học trọn vẹn"
          />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="rounded-lg border border-border bg-surface p-6 shadow-sm"
              >
                <span className="flex size-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Icon name={feature.icon} className="size-5" />
                </span>
                <h3 className="mt-4 font-heading text-h4 font-semibold">
                  {feature.title}
                </h3>
                <p className="mt-2 text-body-sm text-foreground-secondary">
                  {feature.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Newest courses ───────────────────────────────────────────── */}
        <section
          aria-labelledby="home-courses"
          className="border-y border-border bg-surface-secondary"
        >
          <div className="container py-16 sm:py-20">
            <SectionHeading
              id="home-courses"
              eyebrow="Thư viện khóa học"
              title="Khóa học mới"
              link={{ href: "/courses", label: "Xem tất cả khóa học" }}
            />
            {courses.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    headingLevel="h3"
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
                <p className="text-body text-foreground-secondary">
                  {catalogFailed
                    ? "Chưa tải được danh sách khóa học lúc này."
                    : "Các khóa học đầu tiên đang được chuẩn bị."}
                </p>
                <Link
                  href="/courses"
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                >
                  Mở trang khóa học
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="home-steps"
          className="container py-16 sm:py-20"
        >
          <SectionHeading
            id="home-steps"
            eyebrow="Bắt đầu thế nào"
            title="Ba bước để vào học"
          />
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-lg border border-border bg-surface p-6"
              >
                <span className="font-heading text-h2 font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-heading text-h4 font-semibold">
                  {step.title}
                </h3>
                <p className="mt-2 text-body-sm text-foreground-secondary">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Blog ─────────────────────────────────────────────────────── */}
        {posts.length > 0 && (
          <section
            aria-labelledby="home-blog"
            className="border-t border-border"
          >
            <div className="container py-16 sm:py-20">
              <SectionHeading
                id="home-blog"
                eyebrow="Blog"
                title="Bài viết mới"
                link={{ href: "/blog", label: "Đọc thêm trên Blog" }}
              />
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} headingLevel="h3" />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Closing call to action ───────────────────────────────────── */}
        <section className="border-t border-border bg-secondary/40">
          <div className="container flex flex-col items-center py-16 text-center sm:py-20">
            <HomeClosingCta />
          </div>
        </section>

        {process.env.NODE_ENV === "development" && (
          <p className="container pb-8 text-center">
            <Link href="/dev/theme" className="text-link text-sm">
              Mở theme showcase
            </Link>
          </p>
        )}
      </main>
    </SiteShell>
  );
}

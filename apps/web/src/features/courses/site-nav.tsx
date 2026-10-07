"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMenu } from "@/features/auth/user-menu";
import { useSession } from "@/features/auth/session-provider";
import { loginUrl } from "@/lib/auth-redirect";
import { api } from "@/lib/api";

const linkClass = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover ${
    active ? "text-primary" : "text-foreground-secondary hover:text-foreground"
  }`;

export function SiteNav() {
  const { user, status } = useSession();
  const pathname = usePathname();
  const is = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  const links = [{ href: "/courses", label: "Khóa học" }];
  if (user) {
    links.push({ href: "/my-learning", label: "Góc học tập" });
    links.push({ href: "/quizzes", label: "Quiz" });
    links.push({ href: "/my-quiz-attempts", label: "Bài thi của tôi" });
    if (user.roles.includes("instructor"))
      links.push({ href: "/instructor/courses", label: "Giảng viên" });
    if (user.roles.includes("admin"))
      links.push({ href: "/admin", label: "Quản trị" });
  }

  return (
    <nav
      className="flex flex-wrap items-center gap-1 sm:gap-2"
      aria-label="Chính"
    >
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={is(item.href) ? "page" : undefined}
          className={linkClass(is(item.href))}
        >
          {item.label}
        </Link>
      ))}
      {user ? (
        <UserMenu />
      ) : status === "loading" ? null : (
        <Link href="/login" className={linkClass(false)}>
          Đăng nhập
        </Link>
      )}
    </nav>
  );
}

export function CourseCta({
  courseId,
  slug,
}: {
  courseId: string;
  slug: string;
}) {
  const { user, status } = useSession();
  const queryClient = useQueryClient();
  const isStudent = Boolean(user?.roles.includes("student"));
  const enrollment = useQuery({
    queryKey: ["course", "enrollment", courseId, user?.id],
    queryFn: ({ signal }) =>
      api<{ isEnrolled: boolean }>(`/courses/${courseId}/enrollment-status`, {
        signal,
      }),
    enabled: isStudent,
    retry: false,
  });
  const resume = useQuery({
    queryKey: ["course", "resume", courseId, user?.id],
    queryFn: ({ signal }) =>
      api<{
        lessonSlug: string | null;
        lessonTitle: string | null;
        lastPosition: number;
        hasStarted: boolean;
      }>(`/courses/${courseId}/resume-lesson`, { signal }),
    enabled: isStudent && enrollment.data?.isEnrolled === true,
    retry: false,
  });
  const enroll = useMutation({
    mutationFn: () => api(`/courses/${courseId}/enroll`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["course", "enrollment", courseId, user?.id],
      });
    },
  });

  if (isStudent && enrollment.data?.isEnrolled === false)
    return (
      <button
        type="button"
        disabled={enroll.isPending}
        onClick={() => enroll.mutate()}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
      >
        {enroll.isPending ? "Đang đăng ký…" : "Đăng ký ngay"}
      </button>
    );
  if (user) {
    const lessonSlug = resume.data?.lessonSlug;
    return (
      <Link
        href={
          lessonSlug
            ? `/learn/${encodeURIComponent(slug)}/${encodeURIComponent(lessonSlug)}`
            : `/learn/${encodeURIComponent(slug)}`
        }
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        {resume.data?.hasStarted
          ? `Tiếp tục học (Bài: ${resume.data.lessonTitle})`
          : "Bắt đầu học"}
      </Link>
    );
  }
  return (
    <>
      <Link
        href={loginUrl(`/learn/${encodeURIComponent(slug)}`)}
        aria-busy={status === "loading"}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Đăng nhập để học
      </Link>
      <p className="mt-3 text-center text-caption text-muted">
        Chưa có tài khoản?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary hover:underline"
        >
          Tạo tài khoản
        </Link>
      </p>
    </>
  );
}

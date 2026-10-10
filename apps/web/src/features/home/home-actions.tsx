"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useSession } from "@/features/auth/session-provider";
import { ResumeLearning } from "@/features/progress/resume-learning";
import { cn } from "@/lib/utils";

export const primaryLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover";
export const outlineLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-6 text-base font-semibold text-foreground transition-colors hover:bg-surface-hover";

/**
 * The home page's calls to action. Visitors are invited to sign up, learners
 * are sent back to their courses. Nothing session-dependent renders while the
 * session loads, so neither group flashes for the other.
 */
export function HomeActions({ className }: { className?: string }) {
  const { user, status } = useSession();
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {user ? (
        <>
          <Link href="/my-learning" className={primaryLink}>
            Vào Góc học tập
            <Icon name="arrow" className="size-4" />
          </Link>
          <Link href="/courses" className={outlineLink}>
            Khám phá khóa học
          </Link>
        </>
      ) : (
        <>
          <Link href="/courses" className={primaryLink}>
            Khám phá khóa học
            <Icon name="arrow" className="size-4" />
          </Link>
          {status !== "loading" && (
            <Link href="/register" className={outlineLink}>
              Đăng ký tài khoản
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** "Tiếp tục học" for a signed-in learner with a course in progress. */
export function HomeResume() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="max-w-xl">
      <ResumeLearning />
    </div>
  );
}

/** Closing band: a different ask depending on who is reading. */
export function HomeClosingCta() {
  const { user, status } = useSession();
  if (status === "loading") return null;
  return user ? (
    <>
      <h2 className="font-heading text-h2 font-semibold">
        Bài học tiếp theo đang chờ bạn
      </h2>
      <p className="mt-3 max-w-xl text-body-lg text-foreground-secondary">
        Mở Góc học tập để học tiếp đúng chỗ bạn dừng lại, hoặc xem lịch các buổi
        học trực tiếp sắp tới.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/my-learning" className={primaryLink}>
          Học tiếp
          <Icon name="arrow" className="size-4" />
        </Link>
        <Link href="/student/dashboard/schedule" className={outlineLink}>
          Xem lịch học
        </Link>
      </div>
    </>
  ) : (
    <>
      <h2 className="font-heading text-h2 font-semibold">
        Sẵn sàng bắt đầu chưa?
      </h2>
      <p className="mt-3 max-w-xl text-body-lg text-foreground-secondary">
        Tạo tài khoản để ghi danh khóa học, làm bài kiểm tra và lưu lại tiến độ
        của bạn.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/register" className={primaryLink}>
          Đăng ký tài khoản
          <Icon name="arrow" className="size-4" />
        </Link>
        <Link href="/login" className={outlineLink}>
          Tôi đã có tài khoản
        </Link>
      </div>
    </>
  );
}

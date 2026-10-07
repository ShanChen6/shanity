"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/session-provider";
import { createOrder, enrollFree } from "@/features/payments/api";
import { formatMoney } from "@/features/payments/format";
import { paymentErrorMessage } from "@/features/payments/order-model";
import { api, ApiError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";

export type CoursePricing = {
  id: string;
  slug: string;
  accessType: "FREE" | "PAID";
  /** Minor units: VND dong / USD cents. */
  price: number;
  currency: string;
};

const primary =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover";

export function PriceTag({ course }: { course: CoursePricing }) {
  return course.accessType === "PAID" ? (
    <p
      className="font-heading text-h2 font-semibold tabular-nums"
      aria-label={`Giá ${formatMoney(course.price, course.currency)}`}
    >
      {formatMoney(course.price, course.currency)}
    </p>
  ) : (
    <p className="font-heading text-h2 font-semibold text-success-foreground">
      Miễn phí
    </p>
  );
}

/**
 * The course page's call to action, chosen from who is looking and what the
 * course costs:
 *   signed out  -> Mua khóa học / Đăng ký ngay  (via login, then back here)
 *   enrolled    -> Vào học ngay
 *   FREE        -> Đăng ký học miễn phí  (grants access, opens the classroom)
 *   PAID        -> price + Mua khóa học  (creates an order, opens checkout)
 */
export function CourseCta({ course }: { course: CoursePricing }) {
  const { user, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isStudent = Boolean(user?.roles.includes("student"));
  const paid = course.accessType === "PAID";
  const learnPath = `/learn/${encodeURIComponent(course.slug)}`;

  const enrollmentKey = ["course", "enrollment", course.id, user?.id];
  const enrollment = useQuery({
    queryKey: enrollmentKey,
    queryFn: ({ signal }) =>
      api<{ isEnrolled: boolean }>(`/courses/${course.id}/enrollment-status`, {
        signal,
      }),
    enabled: isStudent,
    retry: false,
  });
  const resume = useQuery({
    queryKey: ["course", "resume", course.id, user?.id],
    queryFn: ({ signal }) =>
      api<{
        lessonSlug: string | null;
        lessonTitle: string | null;
        lastPosition: number;
        hasStarted: boolean;
      }>(`/courses/${course.id}/resume-lesson`, { signal }),
    enabled: isStudent && enrollment.data?.isEnrolled === true,
    retry: false,
  });

  const free = useMutation({
    mutationFn: () => enrollFree(course.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: enrollmentKey });
      router.push(learnPath);
    },
    onError: (error) => {
      // Someone enrolled in another tab/device: just show the right button.
      if (error instanceof ApiError && error.status === 409)
        void queryClient.invalidateQueries({ queryKey: enrollmentKey });
    },
  });
  const buy = useMutation({
    mutationFn: () => createOrder([course.id]),
    onSuccess: (order) => router.push(`/checkout/${order.code}`),
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.messages.includes("ALREADY_ENROLLED")
      )
        void queryClient.invalidateQueries({ queryKey: enrollmentKey });
    },
  });

  // Signed out (or the session check failed): the buyer logs in, then returns.
  if (!user && status !== "loading")
    return (
      <div className="space-y-3">
        <PriceTag course={course} />
        <Link
          href={loginUrl(`/courses/${encodeURIComponent(course.slug)}`)}
          className={primary}
        >
          {paid ? "Mua khóa học" : "Đăng ký ngay"}
        </Link>
        <p className="text-center text-caption text-muted">
          Chưa có tài khoản?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline"
          >
            Tạo tài khoản
          </Link>
        </p>
      </div>
    );

  if (status === "loading" || (isStudent && enrollment.isPending))
    return (
      <div
        className="space-y-3"
        aria-busy="true"
        aria-label="Đang kiểm tra quyền truy cập"
      >
        <PriceTag course={course} />
        <Skeleton className="h-12 w-full" />
      </div>
    );

  if (isStudent && enrollment.isError)
    return (
      <div className="space-y-3">
        <PriceTag course={course} />
        <Alert tone="error">{paymentErrorMessage(enrollment.error)}</Alert>
        <Button
          className="w-full"
          variant="outline"
          onClick={() => void enrollment.refetch()}
        >
          Thử lại
        </Button>
      </div>
    );

  // Enrolled (free or paid) — or staff previewing the course.
  if (!isStudent || enrollment.data?.isEnrolled) {
    const lessonSlug = resume.data?.lessonSlug;
    return (
      <div className="space-y-3">
        {isStudent && (
          <p className="text-body-sm font-semibold text-success-foreground">
            ✓ Bạn đã sở hữu khóa học này
          </p>
        )}
        <Link
          href={
            lessonSlug
              ? `${learnPath}/${encodeURIComponent(lessonSlug)}`
              : learnPath
          }
          className={primary}
        >
          {resume.data?.hasStarted
            ? `Tiếp tục học (Bài: ${resume.data.lessonTitle})`
            : "Vào học ngay"}
        </Link>
      </div>
    );
  }

  const action = paid ? buy : free;
  return (
    <div className="space-y-3">
      <PriceTag course={course} />
      <Button
        size="lg"
        className="w-full"
        loading={action.isPending}
        loadingLabel={paid ? "Đang tạo đơn hàng…" : "Đang đăng ký…"}
        onClick={() => action.mutate()}
      >
        {paid ? "Mua khóa học" : "Đăng ký học miễn phí"}
      </Button>
      {action.isError && (
        <Alert tone="error">{paymentErrorMessage(action.error)}</Alert>
      )}
      {paid && (
        <p className="text-center text-caption text-muted">
          Thanh toán an toàn · Khóa học mở ngay khi thanh toán thành công
        </p>
      )}
    </div>
  );
}

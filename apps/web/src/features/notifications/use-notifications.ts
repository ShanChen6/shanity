"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-provider";
import {
  fetchGradingQueue,
  gradingQueueKey,
} from "@/features/grading-queue/api";
import { PENDING_GRADING } from "@/features/grading-queue/model";
import { paymentKeys, fetchStudentOrders } from "@/features/payments/api";
import { fetchMyAttempts, historyKey } from "@/features/standalone-quiz/api";

export type AppNotification = {
  id: string;
  title: string;
  description?: string;
  href: string;
  tone: "info" | "warning";
};

const REFRESH_MS = 120_000;
const live = {
  staleTime: 60_000,
  refetchInterval: REFRESH_MS,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

const plural = (count: number, noun: string) => `${count} ${noun}`;

/**
 * "Things waiting on you", derived from data the app already has: there is no
 * notification service, and inventing one would only produce fake alerts.
 *
 *  - instructors: essay answers waiting to be graded
 *  - learners:    orders awaiting payment, quizzes started but unfinished
 */
export function useNotifications(): {
  items: AppNotification[];
  isPending: boolean;
} {
  const { user } = useSession();
  const isInstructor = user?.roles.includes("instructor") ?? false;
  const isLearner = user?.roles.includes("student") ?? false;

  const grading = useQuery({
    queryKey: gradingQueueKey(PENDING_GRADING),
    queryFn: ({ signal }) => fetchGradingQueue(PENDING_GRADING, signal),
    enabled: isInstructor,
    ...live,
  });
  const orders = useQuery({
    queryKey: paymentKeys.orders("pending", 1),
    queryFn: ({ signal }) => fetchStudentOrders("pending", 1, signal),
    enabled: isLearner,
    ...live,
  });
  const attempts = useQuery({
    queryKey: [...historyKey, "all", 1],
    queryFn: ({ signal }) => fetchMyAttempts("all", 1, signal),
    enabled: isLearner,
    ...live,
  });

  const items: AppNotification[] = [];
  const toGrade = grading.data?.pagination.totalItems ?? 0;
  if (toGrade > 0)
    items.push({
      id: "grading",
      title: `${plural(toGrade, "bài làm")} cần chấm`,
      description: "Bài tự luận đang chờ bạn chấm điểm.",
      href: "/instructor/grading",
      tone: "warning",
    });
  const unpaid = orders.data?.total ?? 0;
  if (unpaid > 0)
    items.push({
      id: "orders",
      title: `${plural(unpaid, "đơn hàng")} chờ thanh toán`,
      description: "Hoàn tất thanh toán để mở khóa học.",
      href: "/account/orders?status=pending",
      tone: "warning",
    });
  const running = (attempts.data?.attempts ?? []).filter(
    (attempt) => attempt.status === "IN_PROGRESS" && !attempt.isExpired,
  );
  if (running.length > 0)
    items.push({
      id: "attempts",
      title:
        running.length === 1
          ? `Bạn đang làm dở “${running[0]!.quizTitle}”`
          : `${plural(running.length, "bài kiểm tra")} đang làm dở`,
      description: "Tiếp tục trước khi hết thời gian.",
      href: "/quiz-attempts",
      tone: "info",
    });

  return {
    items,
    isPending:
      (isInstructor && grading.isPending) ||
      (isLearner && (orders.isPending || attempts.isPending)),
  };
}

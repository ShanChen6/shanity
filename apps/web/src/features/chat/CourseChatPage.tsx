"use client";

import Link from "next/link";
import { useLearning } from "@/components/learning/learning-context";
import { Alert } from "@/components/ui/alert";
import { useSession } from "@/features/auth/session-provider";
import { loginUrl } from "@/lib/auth-redirect";
import { CourseChatRoom } from "./CourseChatRoom";

/** The room of the course the learning shell is showing. */
export function CourseChatPage() {
  const { syllabus, courseSlug } = useLearning();
  const { user, status } = useSession();
  if (status === "loading") return null;
  if (!user)
    return (
      <div className="p-6">
        <Alert tone="info" title="Đăng nhập để tham gia thảo luận">
          <Link
            href={loginUrl(`/learn/${encodeURIComponent(courseSlug)}/chat`)}
            className="font-semibold underline"
          >
            Đăng nhập
          </Link>{" "}
          để trò chuyện cùng giảng viên và các bạn trong khóa.
        </Alert>
      </div>
    );
  return (
    <CourseChatRoom
      key={`${user.id}:${syllabus.course.id}`}
      userId={user.id}
      courseId={syllabus.course.id}
      courseTitle={syllabus.course.title}
    />
  );
}

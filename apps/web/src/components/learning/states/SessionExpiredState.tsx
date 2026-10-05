"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { loginUrl } from "@/lib/auth-redirect";
import { learningPath } from "../learning-model";

export const LEARNING_RESUME_KEY = "shanity:learning-resume";

export function SessionExpiredState({ courseSlug, lessonSlug }: {
  courseSlug: string;
  lessonSlug: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const destination = learningPath(courseSlug, lessonSlug);
    localStorage.setItem(LEARNING_RESUME_KEY, destination);
    const timer = window.setTimeout(() => router.replace(loginUrl(destination)), 900);
    return () => window.clearTimeout(timer);
  }, [courseSlug, lessonSlug, router]);
  return (
    <Dialog title="Phiên đăng nhập đã hết hạn" onClose={() => undefined} busy>
      <div data-testid="session-expired" role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
        <LogIn aria-hidden size={38} />
        <p className="text-sm text-muted">Vị trí bài học đã được lưu. Bạn đang được chuyển tới trang đăng nhập…</p>
      </div>
    </Dialog>
  );
}

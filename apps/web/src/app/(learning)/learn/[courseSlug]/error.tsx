"use client";
import { Button } from "@/components/ui/button";

export default function LearningError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Không thể tải trang học tập</h1>
      <p className="text-sm text-muted">Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}

"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert">
      <p>Không thể tải trang quản lý khóa học.</p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

export default function AdminError({ reset }: { reset: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.focus();
  }, []);
  return (
    <div ref={container} tabIndex={-1}>
      <ErrorState
        title="Không thể tải trang quản trị"
        description="Vui lòng thử lại. Nếu lỗi tiếp diễn, bạn có thể quay về trang tổng quan."
        action={
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={reset}>Thử lại</Button>
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center rounded-md text-primary hover:underline"
            >
              Về trang quản trị
            </Link>
          </div>
        }
      />
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function CourseDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <main className="flex min-h-[65dvh] flex-1 items-center justify-center">
      <section className="content flex flex-col items-center py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-background text-danger">
          <Icon name="info" className="size-7" />
        </span>
        <h1 className="mt-5 font-heading text-h3 font-semibold">
          Chưa tải được khóa học
        </h1>
        <p className="mt-2 text-body-sm text-muted">
          Vui lòng kiểm tra kết nối và thử lại.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            loading={isPending}
            loadingLabel="Đang thử lại…"
            onClick={() =>
              startTransition(() => {
                reset();
                router.refresh();
              })
            }
          >
            <Icon name="refresh" />
            Thử lại
          </Button>
          <Link
            href="/courses"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Về danh mục
          </Link>
        </div>
      </section>
    </main>
  );
}

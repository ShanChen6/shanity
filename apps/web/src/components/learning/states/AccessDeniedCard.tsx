import Link from "next/link";
import { Lock } from "lucide-react";

export function AccessDeniedCard({ courseSlug }: { courseSlug: string }) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <Lock aria-hidden size={40} />
      <h2 className="text-xl font-semibold">
        Bài học này thuộc nội dung trả phí
      </h2>
      <p className="text-sm text-muted">
        Vui lòng đăng ký khóa học để tiếp tục.
      </p>
      <Link
        href={`/courses/${encodeURIComponent(courseSlug)}`}
        className="inline-flex control items-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Mua khóa học / Nâng cấp
      </Link>
    </div>
  );
}

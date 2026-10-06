import Link from "next/link";
import { ShieldX } from "lucide-react";

// Shown when the API refuses this course (another instructor's course, or an
// id that does not exist): the same message either way, so ids can't be probed.
export function CourseAccessDenied() {
  return (
    <div
      role="alert"
      data-testid="course-access-denied"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-danger-background text-danger">
        <ShieldX aria-hidden size={30} />
      </span>
      <h1 className="text-2xl font-semibold">403 · Không có quyền truy cập</h1>
      <p className="text-muted">
        Bạn không có quyền xem tiến độ học viên của khóa học này. Bạn chỉ có thể
        xem các khóa học do chính mình phụ trách.
      </p>
      <Link className="instructor-primary-link" href="/instructor/courses">
        ← Về danh sách khóa học của tôi
      </Link>
    </div>
  );
}

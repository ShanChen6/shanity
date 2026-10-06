import Link from "next/link";
import { PauseCircle } from "lucide-react";

// 403 ENROLLMENT_SUSPENDED: the enrollment exists but is revoked/paused.
// Progress is kept server-side and returns when access is restored.
export function EnrollmentSuspendedState() {
  return (
    <div
      role="alert"
      data-testid="enrollment-suspended"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-warning-background text-warning">
        <PauseCircle aria-hidden size={30} />
      </span>
      <h2 className="text-xl font-semibold">Quyền học đang bị tạm khóa</h2>
      <p className="text-sm text-muted">
        Ghi danh của bạn vào khóa học này đang bị tạm dừng. Tiến độ học tập vẫn
        được lưu và sẽ được khôi phục khi quyền truy cập được mở lại.
      </p>
      <Link
        href="/my-learning"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Về Góc học tập
      </Link>
    </div>
  );
}

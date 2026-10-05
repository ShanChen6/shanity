import { Suspense } from "react";
import { requireRole } from "@/lib/server-session";
import { InstructorPortal } from "@/features/instructor/portal";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("instructor");
  return (
    <Suspense fallback={<p>Đang tải không gian giảng viên…</p>}>
      <InstructorPortal>{children}</InstructorPortal>
    </Suspense>
  );
}

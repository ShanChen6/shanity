import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverAccessStatus } from "@/lib/server-session";
import { CourseAccessDenied } from "@/features/instructor/progress/course-access-denied";
import { StudentProgressDashboard } from "@/features/instructor/progress/student-progress-dashboard";

export const metadata: Metadata = {
  title: "Tiến độ học viên · Shanity",
  robots: { index: false },
};

// The layout already requires the instructor role. Ownership is decided by the
// API (CourseOwnerGuard); asking it here means another instructor's course is
// refused before any of this page renders, not just after the client fetch.
export default async function CourseProgressPage({
  params,
}: PageProps<"/instructor/courses/[id]/progress">) {
  const { id } = await params;
  const status = await serverAccessStatus(
    `/api/v1/instructor/courses/${encodeURIComponent(id)}/students-progress?limit=1`,
  );
  if (status === 403) return <CourseAccessDenied />;
  if (status === 404) notFound();
  return <StudentProgressDashboard courseId={id} />;
}

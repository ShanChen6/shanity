import { EnrolledCourses } from "@/features/progress/enrolled-courses";
import { ResumeLearning } from "@/features/progress/resume-learning";
import { requireUser } from "@/lib/server-session";

export default async function Page() {
  await requireUser();
  return (
    <main className="container py-16">
      <h1 className="text-title font-semibold">Tổng quan</h1>
      <ResumeLearning />
      <EnrolledCourses />
    </main>
  );
}

import { EnrolledCourses } from "@/features/progress/enrolled-courses";
import { requireUser } from "@/lib/server-session";

export default async function Page() {
  await requireUser();
  return (
    <main className="container py-16">
      <h1 className="text-title font-semibold">Khóa học của tôi</h1>
      <EnrolledCourses />
    </main>
  );
}

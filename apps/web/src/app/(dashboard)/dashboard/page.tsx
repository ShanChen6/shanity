import Link from "next/link";
import { ResumeLearning } from "@/features/progress/resume-learning";
import { requireUser } from "@/lib/server-session";

export default async function Page() {
  await requireUser();
  return (
    <main className="container py-16">
      <h1 className="text-title font-semibold">Tổng quan</h1>
      <ResumeLearning />
      <Link
        href="/my-learning"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary"
      >
        Xem tất cả khóa học của tôi →
      </Link>
    </main>
  );
}

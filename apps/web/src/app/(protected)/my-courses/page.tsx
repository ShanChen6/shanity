import { requireUser } from "@/lib/server-session";
import Link from "next/link";
export default async function Page() {
  await requireUser();
  return (
    <main className="container py-16">
      <h1 className="text-title font-semibold">Khóa học của tôi</h1>
      <p className="mt-4 text-muted">Nội dung đang được chuẩn bị.</p>
      <div className="mt-6 flex flex-wrap gap-6">
        <Link href="/courses" className="text-primary">
          Khám phá khóa học →
        </Link>
        <Link href="/profile" className="text-primary">
          Hồ sơ của bạn →
        </Link>
      </div>
    </main>
  );
}

import { requireUser } from "@/lib/server-session";
import Link from "next/link";
export default async function Page() {
  await requireUser();
  return (
    <main className="container py-16">
      <h1 className="text-title font-semibold">Khóa học của tôi</h1>
      <p className="mt-4 text-muted">Nội dung đang được chuẩn bị.</p>
      <Link href="/profile" className="mt-6 inline-block text-primary">
        Hồ sơ của bạn →
      </Link>
    </main>
  );
}

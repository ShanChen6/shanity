import Link from "next/link";
export const metadata = {
  title: "Không có quyền truy cập · Shanity",
  robots: { index: false },
};
export default function ForbiddenPage() {
  return (
    <main className="container py-16">
      <p className="mb-3 text-sm font-semibold text-muted">
        Truy cập bị từ chối
      </p>
      <h1 className="text-title font-semibold">Bạn không có quyền truy cập</h1>
      <p className="mt-3 text-muted">Khu vực này chỉ dành cho quản trị viên.</p>
      <Link
        href="/profile"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary"
      >
        Về hồ sơ →
      </Link>
    </main>
  );
}

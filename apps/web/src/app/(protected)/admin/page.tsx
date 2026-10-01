import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { requireRole } from "@/lib/server-session";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
export default async function AdminPage() {
  await requireRole("admin");
  return (
    <>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
        Shanity Admin
      </p>
      <PageHeader
        title="Khu vực quản trị"
        description="Chọn một mục trong menu để bắt đầu."
      />
      <Card className="mt-8 max-w-xl">
        <Icon name="users" className="mb-4 size-7 text-primary" />
        <h2 className="text-lg font-semibold">Người dùng</h2>
        <p className="mb-5 mt-2 text-sm text-muted">
          Truy cập khu vực quản lý người dùng của Shanity.
        </p>
        <Link
          href="/admin/users"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary hover:underline"
        >
          Mở trang người dùng <Icon name="arrow" />
        </Link>
      </Card>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import isUUID from "validator/lib/isUUID";
import { requireRole } from "@/lib/server-session";
import { PageHeader } from "@/components/layout/page-header";
import { UserDetail } from "@/features/admin/user-detail";

export const metadata = { title: "Chi tiết người dùng · Quản trị Shanity" };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const { id } = await params;
  if (!isUUID(id)) notFound();
  const filters = await searchParams;
  const query = new URLSearchParams();
  for (const name of ["page", "search", "role", "status"]) {
    const value = filters[name];
    if (typeof value === "string") query.set(name, value);
  }
  return (
    <>
      <PageHeader
        title="Chi tiết người dùng"
        actions={
          <Link
            href={`/admin/users?${query}`}
            className="rounded-md px-3 py-2 text-sm font-semibold text-primary hover:underline"
          >
            Quay lại danh sách
          </Link>
        }
      />
      <div className="mt-6">
        <UserDetail key={id} id={id} />
      </div>
    </>
  );
}

import { requireRole } from "@/lib/server-session";
import { PageHeader } from "@/components/layout/page-header";
import { UserTable } from "@/features/admin/user-table";
export const metadata = { title: "Người dùng · Quản trị Shanity" };
export default async function AdminUsersPage() {
  await requireRole("admin");
  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Danh sách tài khoản trong hệ thống."
      />
      <div className="mt-6">
        <UserTable />
      </div>
    </>
  );
}

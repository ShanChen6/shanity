import { requireRole } from "@/lib/server-session";
import { PageHeader } from "@/components/layout/page-header";
import { UserTable } from "@/features/admin/user-table";
export const metadata = { title: "Người dùng · Quản trị Shanity" };
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const page = Number(value("page") || 1);
  const query = new URLSearchParams({
    page: String(
      Number.isInteger(page) && page > 0 && page <= 2147483647 ? page : 1,
    ),
    limit: "20",
  });
  const search = value("search").trim().slice(0, 254);
  const role = value("role").toLowerCase();
  const status = value("status").toLowerCase();
  if (search) query.set("search", search);
  if (["student", "instructor", "admin"].includes(role))
    query.set("role", role);
  if (["active", "disabled"].includes(status)) query.set("status", status);
  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Danh sách tài khoản trong hệ thống."
      />
      <div className="mt-6">
        <UserTable query={query.toString()} />
      </div>
    </>
  );
}

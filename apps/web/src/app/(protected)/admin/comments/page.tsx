import { PageHeader } from "@/components/layout/page-header";
import { AdminCommentQueue } from "@/features/blog/comments/AdminCommentQueue";
import { ADMIN_ROLES } from "@/lib/admin-access";
import { requireAnyRole } from "@/lib/server-session";

export const metadata = { title: "Bình luận blog · Quản trị Shanity" };

export default async function AdminCommentsPage() {
  await requireAnyRole(ADMIN_ROLES);
  return (
    <>
      <PageHeader
        title="Bình luận blog"
        description="Bình luận được kiểm duyệt tự động; ở đây là những trường hợp hệ thống để lại cho người duyệt. Mọi quyết định đều được ghi nhật ký."
      />
      <div className="mt-6">
        <AdminCommentQueue />
      </div>
    </>
  );
}

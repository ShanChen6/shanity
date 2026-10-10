import { PostEditor } from "@/features/blog/authoring/PostEditor";
import { ADMIN_ROLES } from "@/lib/admin-access";
import { requireAnyRole } from "@/lib/server-session";

export const metadata = { title: "Chỉnh sửa bài viết · Quản trị Shanity" };

export default async function AdminEditPostPage({
  params,
}: PageProps<"/admin/blog/[id]/edit">) {
  await requireAnyRole(ADMIN_ROLES);
  const { id } = await params;
  return <PostEditor basePath="/admin/blog" postId={id} />;
}

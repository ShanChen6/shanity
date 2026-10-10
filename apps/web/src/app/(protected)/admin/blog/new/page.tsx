import { PostEditor } from "@/features/blog/authoring/PostEditor";
import { ADMIN_ROLES } from "@/lib/admin-access";
import { requireAnyRole } from "@/lib/server-session";

export const metadata = { title: "Viết bài mới · Quản trị Shanity" };

export default async function AdminNewPostPage() {
  await requireAnyRole(ADMIN_ROLES);
  return <PostEditor basePath="/admin/blog" />;
}

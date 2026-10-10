import { PostList } from "@/features/blog/authoring/PostList";
import { ADMIN_ROLES } from "@/lib/admin-access";
import { requireAnyRole } from "@/lib/server-session";

export const metadata = { title: "Blog · Quản trị Shanity" };

export default async function AdminBlogPage() {
  await requireAnyRole(ADMIN_ROLES);
  return <PostList basePath="/admin/blog" />;
}

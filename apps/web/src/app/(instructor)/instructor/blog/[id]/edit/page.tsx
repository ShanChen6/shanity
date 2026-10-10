import { PostEditor } from "@/features/blog/authoring/PostEditor";

export const metadata = { title: "Chỉnh sửa bài viết · Giảng viên Shanity" };

export default async function Page({
  params,
}: PageProps<"/instructor/blog/[id]/edit">) {
  const { id } = await params;
  return <PostEditor basePath="/instructor/blog" postId={id} />;
}

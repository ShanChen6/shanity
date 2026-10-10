import { PostList } from "@/features/blog/authoring/PostList";

export const metadata = { title: "Bài viết blog · Giảng viên Shanity" };

export default function Page() {
  return <PostList basePath="/instructor/blog" />;
}

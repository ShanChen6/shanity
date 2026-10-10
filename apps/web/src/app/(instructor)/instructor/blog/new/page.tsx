import { PostEditor } from "@/features/blog/authoring/PostEditor";

export const metadata = { title: "Viết bài mới · Giảng viên Shanity" };

export default function Page() {
  return <PostEditor basePath="/instructor/blog" />;
}

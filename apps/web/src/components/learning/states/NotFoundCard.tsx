import Link from "next/link";
import { FileQuestion } from "lucide-react";

export function NotFoundCard({ scope }: { scope: "course" | "lesson" }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
      <FileQuestion aria-hidden size={40} />
      <h2 className="text-xl font-semibold">Không tìm thấy {scope === "course" ? "khóa học" : "bài học"}</h2>
      <p className="text-sm text-muted">Nội dung không tồn tại, đã bị xóa hoặc chưa được xuất bản.</p>
      <Link href="/courses" className="text-sm font-semibold text-primary underline">Quay lại danh sách khóa học</Link>
    </div>
  );
}

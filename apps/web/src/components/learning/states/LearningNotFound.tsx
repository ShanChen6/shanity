import Link from "next/link";

export function LearningNotFound({
  courseSlug,
  scope,
}: {
  courseSlug?: string;
  scope: "course" | "lesson";
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
      <h2 className="text-xl font-semibold">
        {scope === "course"
          ? "Không tìm thấy khóa học"
          : "Không tìm thấy bài học"}
      </h2>
      <p className="text-sm text-muted">
        {scope === "course"
          ? "Khóa học không tồn tại hoặc chưa được xuất bản."
          : "Bài học này không tồn tại trong khóa học."}
      </p>
      <Link
        href={
          scope === "lesson" && courseSlug
            ? `/courses/${courseSlug}`
            : "/courses"
        }
        className="text-sm text-primary underline"
      >
        {scope === "lesson"
          ? "Quay lại khóa học"
          : "Quay lại danh mục khóa học"}
      </Link>
    </div>
  );
}

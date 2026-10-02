import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { API_URL, ApiError } from "@/lib/api";
import { PublicCourseDetailView } from "@/features/courses/detail-view";
import type { PublicCourseDetail } from "@/features/courses/detail-view";

export const metadata: Metadata = {
  title: "Chi tiết khóa học | Shanity",
  description: "Xem thông tin và đề cương khóa học trên Shanity.",
};

async function getCourse(slug: string): Promise<PublicCourseDetail> {
  const origin = process.env.API_INTERNAL_URL ?? API_URL;
  let response: Response;
  try {
    response = await fetch(
      `${origin.replace(/\/$/, "")}/public/courses/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(12000) },
    );
  } catch {
    throw new ApiError(0, ["Không thể kết nối máy chủ. Vui lòng thử lại."]);
  }

  const result: unknown = await response.json().catch(() => null);
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new ApiError(response.status, ["Không thể tải thông tin khóa học."]);
  if (
    !result ||
    typeof result !== "object" ||
    !("course" in result) ||
    !("curriculum" in result)
  )
    throw new ApiError(502, ["Dữ liệu khóa học không hợp lệ."]);
  return result as PublicCourseDetail;
}

export default async function CourseDetailPage({
  params,
}: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const detail = await getCourse(slug);
  return <PublicCourseDetailView detail={detail} />;
}

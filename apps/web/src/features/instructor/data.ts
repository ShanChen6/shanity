"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { api, ApiError, API_URL } from "@/lib/api";
export type Course = {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  thumbnail: string | null;
  category: string;
  level: string;
  language: string;
  price: number;
  status: "draft" | "published" | "archived";
  // Students must complete required lessons in order.
  isSequential?: boolean;
};
export type Chapter = { id: string; title: string; position: number };
export type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  type: "Article" | "Video" | "Quiz";
  contentType: "TEXT" | "VIDEO" | "DOCUMENT";
  body: string;
  videoUrl: string | null;
  videoAssetId: string | null;
  documentAssetId: string | null;
  position: number;
};
export const courseKey = (id: string) => ["instructor", "course", id];
export const chaptersKey = (id: string) => ["instructor", "chapters", id];
export const lessonsKey = (id: string) => ["instructor", "lessons", id];
export const coursePath = (id: string) => `/instructor/courses/${id}`;
export const mediaUrl = (url: string | null) =>
  url?.startsWith("/course-media/")
    ? `${API_URL}${url}`
    : /^https?:\/\//.test(url ?? "")
      ? url!
      : "";
export const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255);
export function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "403 — Bạn không có quyền quản lý khóa học này.";
    if (error.status === 404)
      return "Không tìm thấy khóa học hoặc nội dung đã bị xóa.";
    if (error.status === 409)
      return "Slug đã tồn tại hoặc trạng thái đã thay đổi. Vui lòng kiểm tra và thử lại.";
    return error.message;
  }
  return "Không thể hoàn tất. Vui lòng thử lại.";
}
export function useCourse(id: string) {
  return useQuery({
    queryKey: courseKey(id),
    queryFn: ({ signal }) => api<Course>(`/courses/${id}`, { signal }),
  });
}
export function useChapters(id: string) {
  return useQuery({
    queryKey: chaptersKey(id),
    queryFn: ({ signal }) =>
      api<Chapter[]>(`/courses/${id}/chapters`, { signal }),
  });
}
export function useLessons(id: string) {
  return useQuery({
    queryKey: lessonsKey(id),
    queryFn: ({ signal }) =>
      api<Lesson[]>(`/courses/${id}/lessons`, { signal }),
  });
}
export function useSaveCourse(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<Course>) =>
      api<Course>(`/courses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onMutate: async (values) => {
      await client.cancelQueries({ queryKey: courseKey(id) });
      const previous = client.getQueryData<Course>(courseKey(id));
      if (previous)
        client.setQueryData(courseKey(id), { ...previous, ...values });
      return { previous };
    },
    onError: (_error, _values, context) => {
      if (context?.previous)
        client.setQueryData(courseKey(id), context.previous);
    },
    onSuccess: (course) => client.setQueryData(courseKey(id), course),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ["instructor", "courses"] }),
  });
}
export function useReorder(id: string, kind: "chapters" | "lessons") {
  const key = kind === "chapters" ? chaptersKey(id) : lessonsKey(id);
  return useOptimisticMutation<
    unknown,
    { items: (Chapter | Lesson)[]; chapterId?: string },
    (Chapter | Lesson)[]
  >({
    queryKey: key,
    mutationFn: ({ items, chapterId }) =>
      api(
        `/courses/${id}/${kind === "chapters" ? "chapters/reorder" : `chapters/${chapterId}/lessons/reorder`}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            kind === "chapters"
              ? {
                  chapterOrders: items.map((item, position) => ({
                    id: item.id,
                    position,
                  })),
                }
              : { ids: items.map((item) => item.id) },
          ),
        },
      ),
    apply: (previous, { items, chapterId }) => {
      const reordered = items.map((item, position) => ({ ...item, position }));
      return kind === "chapters"
        ? reordered
        : [
            ...(previous ?? []).filter(
              (item) => (item as Lesson).chapterId !== chapterId,
            ),
            ...reordered,
          ];
    },
    failureMessage:
      kind === "chapters"
        ? "Không lưu được thứ tự chương, đã khôi phục thứ tự cũ."
        : "Không lưu được thứ tự bài học, đã khôi phục thứ tự cũ.",
  });
}

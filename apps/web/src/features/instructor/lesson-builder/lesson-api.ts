"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, API_URL } from "@/lib/api";
import { lessonsKey } from "../data";
import { sortLessons, toReorderPayload } from "./reorder";
import type { LessonFormValues } from "./schema";
import type { ApiLesson, LessonType } from "./types";

export const chapterLessonsKey = (chapterId: string) => [
  "instructor",
  "chapter-lessons",
  chapterId,
];

export function useChapterLessons(chapterId: string) {
  return useQuery({
    queryKey: chapterLessonsKey(chapterId),
    queryFn: ({ signal }) =>
      api<ApiLesson[]>(`/chapters/${chapterId}/lessons`, { signal }),
    select: sortLessons,
  });
}

function xhrUpload<T>(
  path: string,
  method: "POST",
  form: FormData,
  onProgress?: (percent: number) => void,
) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, `${API_URL}${path}`);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new ApiError(0, ["Không thể kết nối máy chủ. Vui lòng thử lại."]));
    request.ontimeout = request.onerror;
    request.onload = () => {
      let data: { message?: string | string[] } = {};
      try {
        data = JSON.parse(request.responseText || "{}");
      } catch {}
      if (request.status >= 200 && request.status < 300)
        return resolve(data as T);
      const messages = Array.isArray(data.message)
        ? data.message
        : [data.message ?? "Yêu cầu không thành công."];
      reject(new ApiError(request.status, messages));
    };
    request.send(form);
  });
}

// Uploads use XHR for progress events; a 401 triggers one session refresh and a retry.
export async function uploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
) {
  try {
    return await xhrUpload<T>(path, "POST", form, onProgress);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await api("/users/me");
    return xhrUpload<T>(path, "POST", form, onProgress);
  }
}

export type SaveLessonInput =
  | {
      mode: "create";
      type: LessonType;
      values: LessonFormValues;
      onProgress?: (percent: number) => void;
    }
  | {
      mode: "edit";
      lesson: ApiLesson;
      values: LessonFormValues;
      onProgress?: (percent: number) => void;
    };

const json = (body: unknown) => JSON.stringify(body);

function mediaForm(values: LessonFormValues, type: LessonType) {
  const form = new FormData();
  form.append("title", values.title.trim());
  form.append("isPreview", String(values.isPreview));
  form.append("isRequired", String(values.isRequired));
  if (type === "DOCUMENT")
    form.append("allowDownload", String(values.allowDownload));
  form.append("file", values.file!);
  return form;
}

export async function saveLesson(
  chapterId: string,
  input: SaveLessonInput,
): Promise<ApiLesson> {
  const { values, onProgress } = input;
  const title = values.title.trim();

  if (input.mode === "create") {
    const { type } = input;
    if (type === "TEXT")
      return api<ApiLesson>(`/chapters/${chapterId}/lessons`, {
        method: "POST",
        body: json({
          title,
          type,
          isPreview: values.isPreview,
          isRequired: values.isRequired,
          content: { textBody: values.textBody },
        }),
      });
    if (type === "VIDEO" && values.source === "url")
      return api<ApiLesson>(`/chapters/${chapterId}/lessons`, {
        method: "POST",
        body: json({
          title,
          type,
          isPreview: values.isPreview,
          isRequired: values.isRequired,
          content: { videoUrl: values.videoUrl.trim() },
        }),
      });
    return uploadForm<ApiLesson>(
      `/chapters/${chapterId}/lessons/${type === "VIDEO" ? "video-upload" : "document-upload"}`,
      mediaForm(values, type),
      onProgress,
    );
  }

  const { lesson } = input;
  let result = lesson;
  const patch: Record<string, unknown> = {};
  if (title !== lesson.title) patch.title = title;
  if (values.isPreview !== lesson.isPreview) patch.isPreview = values.isPreview;
  if (values.isRequired !== lesson.isRequired)
    patch.isRequired = values.isRequired;
  if (lesson.type === "TEXT" && values.textBody !== (lesson.textBody ?? ""))
    patch.content = { textBody: values.textBody };
  if (
    lesson.type === "VIDEO" &&
    values.source === "url" &&
    values.videoUrl.trim() !== (lesson.videoExternalUrl ?? "")
  )
    patch.content = { videoUrl: values.videoUrl.trim() };

  if (Object.keys(patch).length)
    result = await api<ApiLesson>(`/lessons/${lesson.id}`, {
      method: "PATCH",
      body: json(patch),
    });

  if (lesson.type === "VIDEO" && values.source === "upload" && values.file)
    result = await uploadForm<ApiLesson>(
      `/lessons/${lesson.id}/video-upload`,
      mediaForm(values, "VIDEO"),
      onProgress,
    );
  if (lesson.type === "DOCUMENT") {
    if (values.file)
      result = await uploadForm<ApiLesson>(
        `/lessons/${lesson.id}/document-upload`,
        mediaForm(values, "DOCUMENT"),
        onProgress,
      );
    else if (values.allowDownload !== (lesson.documentDownloadAllowed ?? false))
      result = await api<ApiLesson>(`/lessons/${lesson.id}/document-settings`, {
        method: "PATCH",
        body: json({ allowDownload: values.allowDownload }),
      });
  }
  return result;
}

export function useLessonMutations(courseId: string, chapterId: string) {
  const client = useQueryClient();
  const key = chapterLessonsKey(chapterId);
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: lessonsKey(courseId) }),
    ]);

  const save = useMutation({
    mutationFn: (input: SaveLessonInput) => saveLesson(chapterId, input),
    onSuccess: (lesson) => {
      client.setQueryData<ApiLesson[]>(key, (current = []) =>
        current.some((item) => item.id === lesson.id)
          ? current.map((item) => (item.id === lesson.id ? lesson : item))
          : [...current, lesson],
      );
    },
    onSettled: refresh,
  });

  const patch = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<
        Pick<ApiLesson, "isPreview" | "isPublished" | "isRequired">
      >;
    }) =>
      api<ApiLesson>(`/lessons/${id}`, {
        method: "PATCH",
        body: json(changes),
      }),
    onMutate: async ({ id, changes }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ApiLesson[]>(key);
      client.setQueryData<ApiLesson[]>(key, (current = []) =>
        current.map((item) =>
          item.id === id ? { ...item, ...changes } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/lessons/${id}`, { method: "DELETE" }),
    onSettled: refresh,
  });

  const reorder = useMutation({
    mutationFn: (items: ApiLesson[]) =>
      api(`/chapters/${chapterId}/lessons/reorder`, {
        method: "PATCH",
        body: json(toReorderPayload(items)),
      }),
    onMutate: async (items) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ApiLesson[]>(key);
      client.setQueryData<ApiLesson[]>(
        key,
        items.map((item, position) => ({ ...item, position })),
      );
      return { previous };
    },
    onError: (_error, _items, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: refresh,
  });

  return { save, patch, remove, reorder };
}

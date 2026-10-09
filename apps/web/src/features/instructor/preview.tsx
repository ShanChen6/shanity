"use client";
import Image from "next/image";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useCourse,
  useChapters,
  useLessons,
  courseKey,
  mediaUrl,
  type Course,
} from "./data";
import { EditNav, Failure, Notice, StatusBadge, Confirm } from "./shared";
import { Markdown } from "./markdown";
import { TextLessonViewer } from "@/features/lessons/text-lesson-viewer";
import { isLessonContentValid } from "./preview-validation";

function videoEmbedUrl(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id
        ? `https://www.youtube.com/embed/${encodeURIComponent(id)}`
        : "";
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = url.searchParams.get("v");
      return id
        ? `https://www.youtube.com/embed/${encodeURIComponent(id)}`
        : "";
    }
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id)
        ? `https://player.vimeo.com/video/${id}`
        : "";
    }
  } catch {
    return "";
  }
  return "";
}

export function Preview({ id }: { id: string }) {
  const course = useCourse(id),
    chapters = useChapters(id),
    lessons = useLessons(id);
  const client = useQueryClient();
  const [action, setAction] = useState<
    "publish" | "unpublish" | "archive" | null
  >(null);
  const [notice, setNotice] = useState("");
  const transition = useMutation({
    mutationFn: (action: string) =>
      api<Course>(`/api/v1/instructor/courses/${id}/${action}`, {
        method: "POST",
      }),
    onSuccess: async (value) => {
      client.setQueryData(courseKey(id), value);
      await client.invalidateQueries({ queryKey: ["instructor", "courses"] });
      setAction(null);
      setNotice(`Đã cập nhật trạng thái: ${value.status}.`);
    },
  });
  if (course.isPending || chapters.isPending || lessons.isPending)
    return <p role="status">Đang tải bản xem trước…</p>;
  const error = course.error || chapters.error || lessons.error;
  if (error)
    return (
      <Failure
        error={error}
        retry={() => {
          void course.refetch();
          void chapters.refetch();
          void lessons.refetch();
        }}
      />
    );
  const data = course.data!;
  const curriculum = chapters.data!;
  const content = lessons.data!;
  const checklist = [
    {
      label: "Tên và mô tả khóa học",
      ready: !!data.title.trim() && !!data.description?.trim(),
    },
    { label: "Ảnh bìa khóa học", ready: !!data.thumbnail?.trim() },
    {
      label: "Có ít nhất một chương với bài học",
      ready: curriculum.length > 0 && content.length > 0,
    },
    {
      label: "Mỗi chương đều có bài học",
      ready:
        curriculum.length > 0 &&
        curriculum.every((chapter) =>
          content.some((lesson) => lesson.chapterId === chapter.id),
        ),
    },
    {
      label:
        "Mỗi bài học đều có nội dung hợp lệ (văn bản, video hoặc tài liệu)",
      ready: content.length > 0 && content.every(isLessonContentValid),
    },
  ];
  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">READY TO SHARE?</p>
          <h1>Xem trước & xuất bản</h1>
          <p>Bản xem trước riêng tư dành cho giảng viên.</p>
        </div>
        <StatusBadge status={data.status} />
      </div>
      <EditNav id={id} active="preview" />
      <Notice>{notice}</Notice>
      <div className="instructor-preview-grid">
        <article className="instructor-panel instructor-student-preview">
          {mediaUrl(data.thumbnail) && (
            <Image
              unoptimized
              width={960}
              height={540}
              src={mediaUrl(data.thumbnail)}
              alt={`Ảnh bìa ${data.title}`}
            />
          )}
          <p className="instructor-eyebrow">
            {data.category} · {data.level} · {data.language}
          </p>
          <h2>{data.title}</h2>
          <p>{data.shortDescription}</p>
          <strong>
            {data.price
              ? `${data.price.toLocaleString("vi-VN")} ₫`
              : "Miễn phí"}
          </strong>
          <Markdown text={data.description ?? "Chưa có mô tả."} />
          <h2>Nội dung khóa học</h2>
          {curriculum.map((chapter) => (
            <section key={chapter.id}>
              <h3>{chapter.title}</h3>
              {content
                .filter((lesson) => lesson.chapterId === chapter.id)
                .sort((a, b) => a.position - b.position)
                .map((lesson) => (
                  <details key={lesson.id}>
                    <summary>
                      {lesson.title} <small>· {lesson.type}</small>
                    </summary>
                    {lesson.type === "Video" &&
                      videoEmbedUrl(lesson.videoUrl) && (
                        <iframe
                          src={videoEmbedUrl(lesson.videoUrl)}
                          title={lesson.title}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )}
                    {lesson.type !== "Video" && (
                      <TextLessonViewer content={lesson.body ?? ""} />
                    )}
                  </details>
                ))}
            </section>
          ))}
          {!curriculum.length && <p>Chưa có chương nào.</p>}
        </article>
        <aside className="instructor-panel instructor-publish-panel">
          <h2>Checklist xuất bản</h2>
          <ul>
            {checklist.map((item) => (
              <li key={item.label} className={cn(item.ready && "is-ready")}>
                <span aria-label={item.ready ? "Đã đủ" : "Còn thiếu"}>
                  {item.ready ? "✓" : "○"}
                </span>{" "}
                {item.label}
              </li>
            ))}
          </ul>
          <p>
            Xuất bản sẽ hiển thị khóa học trong danh mục học viên. Hủy xuất bản
            đưa khóa học về bản nháp.
          </p>
          <div className="instructor-publish-actions">
            {data.status === "draft" && (
              <Button
                disabled={
                  !checklist.every((item) => item.ready) || transition.isPending
                }
                onClick={() => {
                  transition.reset();
                  setAction("publish");
                }}
              >
                Xuất bản
              </Button>
            )}
            {data.status === "published" && (
              <Button
                disabled={transition.isPending}
                onClick={() => {
                  transition.reset();
                  setAction("unpublish");
                }}
              >
                Hủy xuất bản
              </Button>
            )}
            {data.status !== "archived" && (
              <Button
                variant="outline"
                disabled={transition.isPending}
                onClick={() => {
                  transition.reset();
                  setAction("archive");
                }}
              >
                Lưu trữ khóa học
              </Button>
            )}
            {data.status === "archived" && (
              <p>Khóa học đã lưu trữ và không thể xuất bản lại.</p>
            )}
          </div>
        </aside>
      </div>
      {action && (
        <Confirm
          title={
            action === "publish"
              ? "Xuất bản khóa học?"
              : action === "unpublish"
                ? "Đưa khóa học về bản nháp?"
                : "Lưu trữ khóa học?"
          }
          busy={transition.isPending}
          onCancel={() => setAction(null)}
          onConfirm={() => transition.mutate(action)}
        >
          <p>
            {action === "archive"
              ? "Khóa học sẽ ẩn khỏi danh mục. Trạng thái lưu trữ không thể hoàn tác."
              : action === "publish"
                ? "Học viên sẽ nhìn thấy khóa học trong danh mục."
                : "Khóa học sẽ ẩn khỏi danh mục cho tới khi bạn xuất bản lại."}
          </p>
          {transition.error && <Failure error={transition.error} />}
        </Confirm>
      )}
    </>
  );
}

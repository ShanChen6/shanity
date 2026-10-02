"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  useCourse,
  useChapters,
  useLessons,
  useReorder,
  chaptersKey,
  lessonsKey,
  type Chapter,
  type Lesson,
} from "./data";
import { EditNav, Failure, Notice, Confirm } from "./shared";
type Action = { path: string; method: string; body?: unknown };
export function Curriculum({ id }: { id: string }) {
  const course = useCourse(id),
    chapters = useChapters(id),
    lessons = useLessons(id);
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [deletion, setDeletion] = useState<Action | null>(null);
  const chapterOrder = useReorder(id, "chapters"),
    lessonOrder = useReorder(id, "lessons");
  const mutation = useMutation({
    mutationFn: (action: Action) =>
      api(action.path, {
        method: action.method,
        ...(action.body ? { body: JSON.stringify(action.body) } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: chaptersKey(id) }),
        client.invalidateQueries({ queryKey: lessonsKey(id) }),
      ]);
      setDeletion(null);
      setNotice("Đã cập nhật đề cương.");
    },
  });
  const busy =
    mutation.isPending || chapterOrder.isPending || lessonOrder.isPending;
  function act(action: Action, done?: () => void) {
    setNotice("");
    mutation.mutate(action, { onSuccess: done });
  }
  function move<T extends Chapter | Lesson>(
    items: T[],
    index: number,
    delta: number,
    chapterId?: string,
  ) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setNotice("");
    (chapterId ? lessonOrder : chapterOrder).mutate(
      { items: next, chapterId },
      { onSuccess: () => setNotice("Đã lưu thứ tự mới.") },
    );
  }
  if (course.isPending || chapters.isPending || lessons.isPending)
    return <p role="status">Đang tải đề cương…</p>;
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
  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">CURRICULUM BUILDER</p>
          <h1>{course.data?.title}</h1>
          <p>Xây dựng từng chương, từng bước tiến cho học viên.</p>
        </div>
      </div>
      <EditNav id={id} active="curriculum" />
      <Notice>{notice}</Notice>
      {(mutation.error || chapterOrder.error || lessonOrder.error) && (
        <Failure
          error={mutation.error || chapterOrder.error || lessonOrder.error}
        />
      )}
      <div className="instructor-curriculum">
        {chapters.data?.map((chapter, index) => (
          <section className="instructor-panel" key={chapter.id}>
            <div className="instructor-chapter-header">
              <span className="instructor-chapter-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <ChapterTitle
                chapter={chapter}
                busy={busy}
                save={(title) =>
                  act({
                    path: `/chapters/${chapter.id}`,
                    method: "PATCH",
                    body: { title },
                  })
                }
              />
              <div className="instructor-actions">
                <Button
                  variant="outline"
                  disabled={busy || index === 0}
                  aria-label={`Đưa chương ${chapter.title} lên`}
                  onClick={() => move(chapters.data!, index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || index === chapters.data!.length - 1}
                  aria-label={`Đưa chương ${chapter.title} xuống`}
                  onClick={() => move(chapters.data!, index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setDeletion({
                      path: `/chapters/${chapter.id}`,
                      method: "DELETE",
                    })
                  }
                >
                  Xóa chương
                </Button>
              </div>
            </div>
            <div className="instructor-lessons">
              {lessons.data
                ?.filter((lesson) => lesson.chapterId === chapter.id)
                .sort((a, b) => a.position - b.position)
                .map((lesson, index, array) => (
                  <div className="instructor-lesson" key={lesson.id}>
                    <LessonForm
                      lesson={lesson}
                      busy={busy}
                      save={(body, done) =>
                        act(
                          {
                            path: `/courses/${id}/lessons/${lesson.id}`,
                            method: "PATCH",
                            body,
                          },
                          done,
                        )
                      }
                    />
                    <div className="instructor-actions">
                      <Button
                        variant="outline"
                        disabled={busy || index === 0}
                        aria-label={`Đưa bài ${lesson.title} lên`}
                        onClick={() => move(array, index, -1, chapter.id)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || index === array.length - 1}
                        aria-label={`Đưa bài ${lesson.title} xuống`}
                        onClick={() => move(array, index, 1, chapter.id)}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          setDeletion({
                            path: `/courses/${id}/lessons/${lesson.id}`,
                            method: "DELETE",
                          })
                        }
                      >
                        Xóa bài
                      </Button>
                    </div>
                  </div>
                ))}
              <LessonForm
                busy={busy}
                save={(body, done) =>
                  act(
                    {
                      path: `/courses/${id}/chapters/${chapter.id}/lessons`,
                      method: "POST",
                      body,
                    },
                    done,
                  )
                }
              />
            </div>
          </section>
        ))}
      </div>
      {!chapters.data?.length && (
        <div className="instructor-empty">
          <h2>Đề cương đang trống</h2>
          <p>Thêm chương đầu tiên, sau đó thêm các bài học.</p>
        </div>
      )}
      <form
        className="instructor-panel instructor-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy)
            act(
              {
                path: `/courses/${id}/chapters`,
                method: "POST",
                body: { title: title.trim() },
              },
              () => setTitle(""),
            );
        }}
      >
        <label>
          Tên chương mới
          <input
            required
            maxLength={255}
            pattern=".*\S.*"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <Button disabled={busy} type="submit">
          ＋ Thêm chương
        </Button>
      </form>
      {deletion && (
        <Confirm
          title="Xóa nội dung?"
          busy={mutation.isPending}
          onCancel={() => setDeletion(null)}
          onConfirm={() => act(deletion)}
        >
          <p>
            Chương và các bài học bên trong sẽ bị xóa nếu bạn chọn xóa chương.
            Thao tác này không thể hoàn tác.
          </p>
          {mutation.error && <Failure error={mutation.error} />}
        </Confirm>
      )}
    </>
  );
}
function ChapterTitle({
  chapter,
  busy,
  save,
}: {
  chapter: Chapter;
  busy: boolean;
  save: (title: string) => void;
}) {
  const [title, setTitle] = useState(chapter.title);
  return (
    <form
      className="instructor-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) save(title.trim());
      }}
    >
      <label>
        <span className="sr-only">Tên chương {chapter.title}</span>
        <input
          required
          maxLength={255}
          pattern=".*\S.*"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        variant="ghost"
        disabled={busy || title === chapter.title}
      >
        Đổi tên
      </Button>
    </form>
  );
}
function LessonForm({
  lesson,
  busy,
  save,
}: {
  lesson?: Lesson;
  busy: boolean;
  save: (body: unknown, done: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [type, setType] = useState(lesson?.type ?? "Article");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? "");
  return (
    <div className="instructor-lesson-editor">
      <Button
        variant="ghost"
        disabled={busy}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {lesson
          ? `${lesson.type === "Video" ? "▷" : "▤"} ${lesson.title} · ${lesson.type}`
          : "＋ Thêm bài học"}
      </Button>
      {open && (
        <form
          className="instructor-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy)
              save(
                {
                  title: title.trim(),
                  type,
                  body,
                  ...(type === "Video" && videoUrl ? { videoUrl } : {}),
                },
                () => {
                  setOpen(false);
                  if (!lesson) {
                    setTitle("");
                    setBody("");
                    setVideoUrl("");
                  }
                },
              );
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Tiêu đề bài học
              <input
                required
                maxLength={255}
                pattern=".*\S.*"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Loại bài học
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Lesson["type"])}
              >
                {["Article", "Video", "Quiz"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {type === "Video" && (
              <label>
                URL video
                <input
                  type="url"
                  pattern="https?://.*"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                />
              </label>
            )}
            <label>
              {type === "Quiz"
                ? "Câu hỏi và hướng dẫn (Markdown)"
                : "Nội dung bài học (Markdown)"}
              <textarea
                rows={5}
                maxLength={100000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <div className="instructor-actions">
              <Button type="submit">
                {lesson ? "Lưu bài học" : "Tạo bài học"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}

"use client";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import {
  useCourseChapters,
  useCourseLessons,
  useInstructorCourses,
} from "./api";
import {
  SCOPES,
  withChapter,
  withCourse,
  withScope,
  type QuizDraft,
} from "./model";

/**
 * Scope radio group plus the cascade it needs: STANDALONE none, COURSE a
 * course, CHAPTER course -> chapter, LESSON course -> chapter -> lesson.
 * Scope and target are fixed once the quiz exists (`locked`).
 */
export function TargetSelector({
  draft,
  locked,
  readOnly,
  error,
  onChange,
}: {
  draft: QuizDraft;
  locked: boolean;
  readOnly: boolean;
  error?: string;
  onChange: (draft: QuizDraft) => void;
}) {
  const courses = useInstructorCourses();
  const chapters = useCourseChapters(draft.courseId);
  const lessons = useCourseLessons(
    draft.scope === "LESSON" ? draft.courseId : "",
  );
  const disabled = locked || readOnly;
  const needsCourse = draft.scope !== "STANDALONE";
  const needsChapter = draft.scope === "CHAPTER" || draft.scope === "LESSON";
  const needsLesson = draft.scope === "LESSON";
  const chapterLessons = (lessons.data ?? []).filter(
    (lesson) => lesson.chapterId === draft.chapterId,
  );
  const sortedChapters = [...(chapters.data ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">Phạm vi (Scope)</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SCOPES.map((scope) => {
            const checked = draft.scope === scope.value;
            return (
              <label
                key={scope.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                  checked
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border hover:bg-surface-hover"
                } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <Radio
                  name="quiz-scope"
                  value={scope.value}
                  checked={checked}
                  disabled={disabled}
                  className="mt-0.5"
                  onChange={() => onChange(withScope(draft, scope.value))}
                />
                <span>
                  <span className="block font-semibold">{scope.label}</span>
                  <span className="block text-xs text-muted">{scope.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        {locked ? (
          <p className="mt-2 text-xs text-muted">
            Phạm vi và vị trí gắn quiz không đổi được sau khi tạo.
          </p>
        ) : null}
      </fieldset>

      {needsCourse ? (
        <div
          className={`grid grid-cols-1 gap-3 ${needsLesson ? "md:grid-cols-3" : needsChapter ? "md:grid-cols-2" : ""}`}
        >
          <label className="block text-sm font-medium">
            Khóa học
            <Select
              className="mt-2"
              value={draft.courseId}
              disabled={disabled || courses.isPending}
              aria-invalid={error && !draft.courseId ? true : undefined}
              onChange={(event) =>
                onChange(withCourse(draft, event.target.value))
              }
            >
              <option value="">
                {courses.isPending ? "Đang tải…" : "— Chọn khóa học —"}
              </option>
              {(courses.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
          </label>
          {needsChapter ? (
            <label className="block text-sm font-medium">
              Chương
              <Select
                className="mt-2"
                value={draft.chapterId}
                disabled={disabled || !draft.courseId || chapters.isPending}
                aria-invalid={
                  error && draft.courseId && !draft.chapterId ? true : undefined
                }
                onChange={(event) =>
                  onChange(withChapter(draft, event.target.value))
                }
              >
                <option value="">
                  {!draft.courseId ? "Chọn khóa học trước" : "— Chọn chương —"}
                </option>
                {sortedChapters.map((chapter, index) => (
                  <option key={chapter.id} value={chapter.id}>
                    {index + 1}. {chapter.title}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {needsLesson ? (
            <label className="block text-sm font-medium">
              Bài học
              <Select
                className="mt-2"
                value={draft.lessonId}
                disabled={disabled || !draft.chapterId || lessons.isPending}
                aria-invalid={
                  error && draft.chapterId && !draft.lessonId ? true : undefined
                }
                onChange={(event) =>
                  onChange({ ...draft, lessonId: event.target.value })
                }
              >
                <option value="">
                  {!draft.chapterId ? "Chọn chương trước" : "— Chọn bài học —"}
                </option>
                {chapterLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </Select>
              {draft.chapterId && lessons.data && !chapterLessons.length ? (
                <span className="mt-1 block text-xs font-normal text-muted">
                  Chương này chưa có bài học.
                </span>
              ) : null}
            </label>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted">
          Quiz độc lập không gắn vào khóa học. Học viên đã đăng nhập tìm thấy nó
          qua slug.
        </p>
      )}
      {error ? (
        <p className="text-sm text-danger-foreground" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";
import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { message } from "../data";
import { Confirm, Failure } from "../shared";
import { CreateLessonModal } from "./CreateLessonModal";
import { EditLessonDrawer } from "./EditLessonDrawer";
import { LessonItem } from "./LessonItem";
import { useChapterLessons, useLessonMutations } from "./lesson-api";
import { reorderAfterDrag } from "./reorder";
import { LESSON_TYPES, TYPE_LABEL, type ApiLesson, type LessonType } from "./types";

// Lessons of one chapter: list, drag-and-drop reorder, create/edit/delete, toggles.
export function CurriculumTree({
  courseId,
  chapterId,
  onNotice,
}: {
  courseId: string;
  chapterId: string;
  onNotice?: (text: string) => void;
}) {
  const query = useChapterLessons(chapterId);
  const { save, patch, remove, reorder } = useLessonMutations(
    courseId,
    chapterId,
  );
  const [creating, setCreating] = useState<LessonType | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ApiLesson | null>(null);
  const lessons = query.data;
  const editing = lessons?.find((lesson) => lesson.id === editingId) ?? null;
  const ids = useMemo(() => lessons?.map((lesson) => lesson.id) ?? [], [lessons]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!lessons) return;
      const next = reorderAfterDrag(lessons, String(active.id), over && String(over.id));
      if (!next) return;
      reorder.mutate(next, { onSuccess: () => onNotice?.("Đã lưu thứ tự mới.") });
    },
    [lessons, reorder, onNotice],
  );

  const togglePublished = useCallback(
    (lesson: ApiLesson, value: boolean) =>
      patch.mutate({ id: lesson.id, changes: { isPublished: value } }),
    [patch],
  );
  const togglePreview = useCallback(
    (lesson: ApiLesson, value: boolean) =>
      patch.mutate({ id: lesson.id, changes: { isPreview: value } }),
    [patch],
  );
  const edit = useCallback((lesson: ApiLesson) => setEditingId(lesson.id), []);
  const askDelete = useCallback((lesson: ApiLesson) => setDeleting(lesson), []);

  const saveAndNotify = useCallback(
    async (input: Parameters<typeof save.mutateAsync>[0]) => {
      await save.mutateAsync(input);
      onNotice?.("Đã lưu bài học.");
    },
    [save, onNotice],
  );

  if (query.isPending)
    return <Skeleton className="h-16 w-full" aria-label="Đang tải bài học" />;
  if (query.error) return <Failure error={query.error} retry={() => query.refetch()} />;

  const mutationError = patch.error || reorder.error || remove.error;
  const busy = reorder.isPending;

  return (
    <div className="space-y-3">
      {mutationError && (
        <p role="alert" className="text-sm text-danger">
          {message(mutationError)}
        </p>
      )}
      {lessons && lessons.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2" aria-busy={busy || undefined}>
              {lessons.map((lesson) => (
                <LessonItem
                  key={lesson.id}
                  lesson={lesson}
                  courseId={courseId}
                  busy={busy}
                  onTogglePublished={togglePublished}
                  onTogglePreview={togglePreview}
                  onEdit={edit}
                  onDelete={askDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted">Chương này chưa có bài học.</p>
      )}

      <DropdownMenu
        label="+ Add Lesson"
        disabled={busy}
        items={LESSON_TYPES.map((type) => ({
          key: type,
          label: TYPE_LABEL[type],
          onSelect: () => setCreating(type),
        }))}
      />

      {creating && (
        <CreateLessonModal
          type={creating}
          onSubmit={saveAndNotify}
          onClose={() => setCreating(null)}
        />
      )}
      {editing && (
        <EditLessonDrawer
          key={editing.id}
          lesson={editing}
          courseId={courseId}
          onSubmit={saveAndNotify}
          onClose={() => setEditingId(null)}
        />
      )}
      {deleting && (
        <Confirm
          title="Xóa bài học?"
          busy={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                onNotice?.("Đã xóa bài học.");
              },
              onError: () => setDeleting(null),
            })
          }
        >
          Bài học “{deleting.title}” sẽ bị xóa vĩnh viễn.
        </Confirm>
      )}
    </div>
  );
}

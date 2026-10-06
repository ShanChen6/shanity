"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  PlayCircle,
  Users,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_URL, ApiError } from "@/lib/api";
import { EditNav, Failure } from "../shared";
import {
  STUDENT_SORTS,
  STUDENT_STATUSES,
  formatDate,
  parseProgressQuery,
  relativeTime,
  useStudentLessons,
  useStudentsProgress,
  type StudentProgressRow,
  type StudentProgressStatus,
  type StudentsProgressQuery,
} from "./api";
import { CourseAccessDenied } from "./course-access-denied";

const STATUS_BADGE: Record<
  StudentProgressStatus,
  { label: string; tone: "success" | "info" | "default" }
> = {
  COMPLETED: { label: "Hoàn thành", tone: "success" },
  IN_PROGRESS: { label: "Đang học", tone: "info" },
  NOT_STARTED: { label: "Chưa bắt đầu", tone: "default" },
};

const avatarSource = (url: string | null) =>
  !url ? undefined : /^https?:\/\//i.test(url) ? url : `${API_URL}${url}`;

export function StudentProgressDashboard({ courseId }: { courseId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = parseProgressQuery(params);
  const progress = useStudentsProgress(courseId, query);
  const [searchText, setSearchText] = useState(query.search);
  const [selected, setSelected] = useState<StudentProgressRow | null>(null);

  // Filters live in the URL so reloads, back/forward and shared links keep them.
  function update(next: Partial<StudentsProgressQuery>) {
    const merged = { ...query, page: 1, ...next };
    const search = new URLSearchParams();
    if (merged.search.trim()) search.set("search", merged.search.trim());
    if (merged.status !== "ALL") search.set("status", merged.status);
    if (merged.sortBy !== "last_accessed_desc")
      search.set("sortBy", merged.sortBy);
    if (merged.page > 1) search.set("page", String(merged.page));
    const value = search.toString();
    router.replace(value ? `${pathname}?${value}` : pathname, {
      scroll: false,
    });
  }

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    if (searchText.trim() === query.search.trim()) return;
    const timer = window.setTimeout(() => update({ search: searchText }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  if (progress.error instanceof ApiError && progress.error.status === 403)
    return <CourseAccessDenied />;

  const data = progress.data;
  const course = data?.course;
  const sortOn = (column: "percentage" | "last_accessed") =>
    column === "percentage"
      ? query.sortBy === "percentage_desc"
        ? "descending"
        : query.sortBy === "percentage_asc"
          ? "ascending"
          : "none"
      : query.sortBy === "last_accessed_desc"
        ? "descending"
        : "none";

  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">STUDENT PROGRESS</p>
          <h1>{course?.title ?? "Tiến độ học viên"}</h1>
          <p>Theo dõi mức độ hoàn thành của từng học viên trong khóa học.</p>
        </div>
      </div>
      <EditNav id={courseId} active="progress" />

      <section
        aria-label="Tổng quan lớp học"
        className="mb-6 grid gap-4 sm:grid-cols-3"
      >
        <MetricCard
          icon={<Users aria-hidden size={20} />}
          label="Học viên đã ghi danh"
          value={course ? String(course.totalStudents) : null}
        />
        <MetricCard
          icon={<TrendingUp aria-hidden size={20} />}
          label="Tỷ lệ hoàn thành trung bình"
          value={course ? `${course.avgProgressPercentage}%` : null}
        />
        <MetricCard
          icon={<Trophy aria-hidden size={20} />}
          label="Đã hoàn thành 100%"
          value={
            course
              ? `${course.completedStudents} (${course.completionRate}%)`
              : null
          }
        />
      </section>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1">
          Tìm kiếm học viên
          <input
            type="search"
            placeholder="Tên hoặc email…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <label className="md:w-52">
          Trạng thái
          <select
            value={query.status}
            onChange={(event) =>
              update({
                status: event.target.value as StudentsProgressQuery["status"],
              })
            }
          >
            {STUDENT_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="md:w-52">
          Sắp xếp
          <select
            value={query.sortBy}
            onChange={(event) =>
              update({
                sortBy: event.target.value as StudentsProgressQuery["sortBy"],
              })
            }
          >
            {STUDENT_SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {progress.isError ? (
        <Failure error={progress.error} retry={() => void progress.refetch()} />
      ) : (
        <div aria-busy={progress.isFetching}>
          <Table aria-label="Tiến độ học viên">
            <TableHeader>
              <TableRow>
                <TableHead>Học viên</TableHead>
                <TableHead>Ngày tham gia</TableHead>
                <TableHead aria-sort={sortOn("last_accessed")}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase"
                    onClick={() => update({ sortBy: "last_accessed_desc" })}
                  >
                    Hoạt động gần nhất
                    {sortOn("last_accessed") === "descending" ? (
                      <ArrowDown aria-hidden size={14} />
                    ) : null}
                  </button>
                </TableHead>
                <TableHead aria-sort={sortOn("percentage")} className="w-56">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase"
                    onClick={() =>
                      update({
                        sortBy:
                          query.sortBy === "percentage_desc"
                            ? "percentage_asc"
                            : "percentage_desc",
                      })
                    }
                  >
                    Tiến độ
                    {sortOn("percentage") === "descending" ? (
                      <ArrowDown aria-hidden size={14} />
                    ) : sortOn("percentage") === "ascending" ? (
                      <ArrowUp aria-hidden size={14} />
                    ) : null}
                  </button>
                </TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data ? (
                [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !data.students.length ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-muted"
                  >
                    {course?.totalStudents
                      ? "Không có học viên nào khớp bộ lọc."
                      : "Chưa có học viên nào ghi danh khóa học này."}
                  </TableCell>
                </TableRow>
              ) : (
                data.students.map((student) => (
                  <StudentRow
                    key={student.studentId}
                    student={student}
                    onOpen={() => setSelected(student)}
                  />
                ))
              )}
            </TableBody>
          </Table>
          {data && data.pagination.totalPages > 1 ? (
            <nav
              aria-label="Phân trang học viên"
              className="instructor-pagination"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
                onClick={() => update({ page: query.page - 1 })}
              >
                ← Trước
              </Button>
              <span>
                Trang {data.pagination.page} / {data.pagination.totalPages} ·{" "}
                {data.pagination.totalItems} học viên
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.page >= data.pagination.totalPages}
                onClick={() => update({ page: query.page + 1 })}
              >
                Sau →
              </Button>
            </nav>
          ) : null}
        </div>
      )}

      {selected ? (
        <StudentLessonsDrawer
          courseId={courseId}
          student={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
      <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        {value === null ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <strong className="block text-2xl font-semibold tabular-nums">
            {value}
          </strong>
        )}
        <span className="text-sm text-muted">{label}</span>
      </div>
    </div>
  );
}

function StudentRow({
  student,
  onOpen,
}: {
  student: StudentProgressRow;
  onOpen: () => void;
}) {
  const { percentage, completedLessons, totalLessons } = student.progress;
  const badge = STATUS_BADGE[student.status];
  return (
    <TableRow
      data-testid={`student-row-${student.studentId}`}
      onClick={onOpen}
      className="cursor-pointer hover:bg-surface-hover"
    >
      <TableCell>
        <div className="flex min-w-56 items-center gap-3">
          <Avatar
            className="size-9 shrink-0"
            name={student.fullName}
            src={avatarSource(student.avatarUrl)}
            unoptimized
          />
          <div className="min-w-0">
            {/* The real control for keyboard users; the row click mirrors it. */}
            <button
              type="button"
              className="block max-w-64 truncate text-left font-semibold hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {student.fullName}
            </button>
            <span className="block max-w-64 truncate text-xs text-muted">
              {student.email}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(student.enrolledAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {student.lastAccessedAt ? (
          <time
            dateTime={student.lastAccessedAt}
            title={new Date(student.lastAccessedAt).toLocaleString("vi-VN")}
          >
            {relativeTime(student.lastAccessedAt)}
          </time>
        ) : (
          <span className="text-muted">{relativeTime(null)}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Progress
            className="flex-1"
            value={percentage}
            label={`Tiến độ của ${student.fullName}`}
            indicatorClassName={
              percentage >= 100 ? "bg-lesson-completed" : "bg-course-progress"
            }
          />
          <span
            className="w-10 text-right font-semibold tabular-nums"
            title={`${completedLessons}/${totalLessons} bài học`}
          >
            {percentage}%
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

const LESSON_ICON = {
  COMPLETED: <CheckCircle2 aria-hidden size={16} className="text-success" />,
  IN_PROGRESS: <PlayCircle aria-hidden size={16} className="text-primary" />,
  NOT_STARTED: <Circle aria-hidden size={16} className="text-border-strong" />,
};
const LESSON_LABEL = {
  COMPLETED: "Đã hoàn thành",
  IN_PROGRESS: "Đang học",
  NOT_STARTED: "Chưa học",
};

function StudentLessonsDrawer({
  courseId,
  student,
  onClose,
}: {
  courseId: string;
  student: StudentProgressRow;
  onClose: () => void;
}) {
  const lessons = useStudentLessons(courseId, student.studentId);
  const done =
    lessons.data?.lessons.filter((lesson) => lesson.status === "COMPLETED")
      .length ?? 0;
  return (
    <Sheet
      title={student.fullName}
      description={`${student.email} · ${student.progress.percentage}% hoàn thành`}
      onClose={onClose}
    >
      {lessons.isPending ? (
        <div className="space-y-2" role="status" aria-label="Đang tải bài học">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      ) : lessons.isError ? (
        <Failure error={lessons.error} retry={() => void lessons.refetch()} />
      ) : (
        <>
          <p className="mb-4 text-sm">
            Đã hoàn thành <strong>{done}</strong>/{lessons.data.lessons.length}{" "}
            bài học
          </p>
          <ul className="space-y-1" aria-label="Bài học">
            {lessons.data.lessons.map((lesson, index, all) => {
              const heading =
                lesson.chapterTitle !== all[index - 1]?.chapterTitle
                  ? lesson.chapterTitle
                  : null;
              return (
                <li key={lesson.lessonId}>
                  {heading ? (
                    <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">
                      {heading}
                    </p>
                  ) : null}
                  <div
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    data-status={lesson.status}
                  >
                    {LESSON_ICON[lesson.status]}
                    <span className="min-w-0 flex-1 truncate">
                      {lesson.title}
                    </span>
                    <span className="sr-only">
                      {LESSON_LABEL[lesson.status]}
                    </span>
                    {!lesson.isRequired ? (
                      <Badge tone="warning">Tùy chọn</Badge>
                    ) : null}
                    {lesson.completedAt ? (
                      <time
                        className="text-xs text-muted"
                        dateTime={lesson.completedAt}
                      >
                        {formatDate(lesson.completedAt)}
                      </time>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Sheet>
  );
}

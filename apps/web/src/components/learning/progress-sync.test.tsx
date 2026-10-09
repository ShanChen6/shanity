import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  courseProgressKey,
  withLessonStatus,
  type CourseProgressResponse,
} from "@/features/progress/use-course-progress";
import { LearningShell } from "./LearningShell";
import { LessonContentViewer } from "./LessonContentViewer";

const push = vi.fn();
let lessonSlug = "l-10";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ lessonSlug }),
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({
    user: { id: "u1", roles: ["student"], displayName: "S", email: "s@x" },
    isAuthenticated: true,
  }),
}));

type Handler = (init?: RequestInit) => unknown;
const routes = new Map<string, Handler>();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      const handler = routes.get(key);
      if (!handler) throw new Error(`Unmocked ${key}`);
      return handler(init);
    }),
  };
});

const COURSE = "c0000000-0000-4000-8000-000000000000";
const TOTAL = 20;
const ids = Array.from({ length: TOTAL }, (_, index) => String(index + 1));
type Options = { sequential?: boolean; optional?: string[] };
const syllabusFor = ({ sequential = false, optional = [] }: Options) => ({
  course: {
    id: COURSE,
    title: "JavaScript Basics",
    slug: "js",
    isSequential: sequential,
  },
  instructor: null,
  curriculum: [
    {
      id: "ch1",
      title: "Core",
      orderIndex: 0,
      lessons: ids.map((id, index) => ({
        id,
        title: `Lesson ${id}`,
        slug: `l-${id}`,
        type: "TEXT" as const,
        position: index,
        isPreview: false,
        isRequired: !optional.includes(id),
      })),
    },
  ],
});

// `completed` lessons are done, `current` is open (IN_PROGRESS).
function progress(
  completed: number,
  current: string,
  optional: string[] = [],
): CourseProgressResponse {
  const base: CourseProgressResponse = {
    courseId: COURSE,
    userId: "u1",
    totalLessons: TOTAL,
    totalRequiredLessons: TOTAL - optional.length,
    completedLessons: 0,
    completedRequiredLessons: 0,
    percentage: 0,
    isCompleted: false,
    updatedAt: "2026-10-06T00:00:00.000Z",
    lessons: ids.map((id) => ({
      lessonId: id,
      status: "NOT_STARTED",
      isRequired: !optional.includes(id),
      lastPosition: 0,
    })),
  };
  let result = withLessonStatus(base, current, "IN_PROGRESS");
  for (const id of ids.slice(0, completed))
    result = withLessonStatus(result, id, "COMPLETED");
  return result;
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  completed: number,
  current: string,
  options: Options & { lessonError?: unknown } = {},
) {
  lessonSlug = `l-${current}`;
  let server = progress(completed, current, options.optional);
  routes.set("GET /api/v1/public/courses/js/syllabus", () =>
    syllabusFor(options),
  );
  routes.set(`GET /api/v1/student/courses/${COURSE}/enrollment-status`, () => ({
    isEnrolled: true,
  }));
  routes.set(`GET /api/v1/student/courses/${COURSE}/progress`, () => server);
  routes.set(`GET /api/v1/student/lessons/${current}`, () => {
    if (options.lessonError) throw options.lessonError;
    return lesson(current);
  });
  const lesson = (id: string) => ({
    id,
    title: `Lesson ${id}`,
    type: "TEXT",
    content: "Short lesson body.",
  });
  routes.set(`POST /api/v1/student/lessons/${current}/progress/start`, () => ({
    progress: { lessonId: current, status: "IN_PROGRESS", lastPosition: 0 },
    courseProgress: server,
  }));
  const completion = deferred<unknown>();
  routes.set(
    `POST /api/v1/student/lessons/${current}/progress/complete`,
    () => completion.promise,
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LearningShell courseSlug="js">
        <LessonContentViewer lessonSlug={lessonSlug} />
      </LearningShell>
    </QueryClientProvider>,
  );
  return {
    client,
    completion,
    // What the server will return after the completion is persisted.
    persist() {
      server = withLessonStatus(server, current, "COMPLETED");
      return {
        progress: { lessonId: current, status: "COMPLETED", lastPosition: 0 },
        courseProgress: server,
      };
    },
  };
}

const header = () => screen.getByTestId("course-progress");
const icon = (id: string) =>
  within(document.querySelector("aside")!).getByTestId(`lesson-status-${id}`);
const completeButton = () =>
  screen.getByRole("button", {
    name: /Đánh dấu Hoàn thành & Sang bài tiếp theo|Hoàn thành khóa học/,
  });

beforeEach(() => {
  push.mockReset();
  routes.clear();
});
afterEach(() => vi.useRealTimers());

describe("learning page progress synchronization", () => {
  it("updates header % and sidebar icon before the server answers, then routes on", async () => {
    const { completion, persist, client } = setup(9, "10");
    await waitFor(() => expect(header()).toHaveTextContent("45%"));
    expect(icon("10")).toHaveAttribute("data-icon", "IN_PROGRESS");
    await waitFor(() => expect(completeButton()).toBeEnabled());

    await userEvent.click(completeButton());
    // Optimistic: no server response yet.
    await waitFor(() => expect(header()).toHaveTextContent("50%"));
    expect(icon("10")).toHaveAttribute("data-icon", "COMPLETED");
    expect(screen.getByTestId("lesson-completed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    completion.resolve(persist());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/learn/js/l-11"));
    // Reconciled with the server's numbers after invalidation.
    await waitFor(() =>
      expect(
        client.getQueryData<CourseProgressResponse>(
          courseProgressKey(COURSE, "u1"),
        )?.completedRequiredLessons,
      ).toBe(10),
    );
    expect(header()).toHaveTextContent("50%");
  });

  it("rolls back and shows a toast when the mutation fails", async () => {
    const { completion } = setup(9, "10");
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await userEvent.click(completeButton());
    await waitFor(() => expect(header()).toHaveTextContent("50%"));

    completion.reject(new ApiError(500, ["boom"]));
    await waitFor(() => expect(header()).toHaveTextContent("45%"));
    expect(icon("10")).toHaveAttribute("data-icon", "IN_PROGRESS");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể lưu tiến độ",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("celebrates instead of routing when the last lesson finishes the course", async () => {
    const { completion, persist } = setup(19, "20");
    await waitFor(() => expect(header()).toHaveTextContent("95%"));
    await waitFor(() => expect(completeButton()).toBeEnabled());
    await userEvent.click(completeButton());
    completion.resolve(persist());
    expect(
      await screen.findByText("Chúc mừng bạn đã hoàn thành khóa học!"),
    ).toBeInTheDocument();
    expect(header()).toHaveTextContent("100%");
    expect(push).not.toHaveBeenCalled();
  });

  it("restores every lesson status from the server on a fresh load", async () => {
    setup(9, "10");
    await waitFor(() =>
      expect(icon("1")).toHaveAttribute("data-icon", "COMPLETED"),
    );
    for (const id of ids.slice(0, 9))
      expect(icon(id)).toHaveAttribute("data-icon", "COMPLETED");
    expect(icon("10")).toHaveAttribute("data-icon", "IN_PROGRESS");
    expect(icon("11")).toHaveAttribute("data-icon", "NOT_STARTED");
  });
});

describe("sequential lesson locking", () => {
  const entry = (id: string) =>
    within(document.querySelector("aside")!)
      .getByTestId(`lesson-status-${id}`)
      .closest("[data-status]")!;

  it("locks later lessons and unlocks the next one the moment the current completes", async () => {
    const { completion, persist } = setup(0, "1", { sequential: true });
    // Wait for server progress (enrollment alone also shows LOCKED links).
    await waitFor(() =>
      expect(icon("1")).toHaveAttribute("data-icon", "IN_PROGRESS"),
    );
    expect(icon("2")).toHaveAttribute("data-icon", "LOCKED");
    // Locked entries are not navigable and explain what to finish first.
    expect(entry("2").tagName).toBe("SPAN");
    expect(entry("2")).toHaveAttribute("aria-disabled", "true");
    expect(entry("2")).toHaveTextContent("Hoàn thành “Lesson 1” để mở khóa");
    expect(icon("20")).toHaveAttribute("data-icon", "LOCKED");
    // Skipping ahead is blocked too.
    expect(
      screen.getByRole("button", { name: "Bài tiếp theo" }),
    ).toBeDisabled();

    await waitFor(() => expect(completeButton()).toBeEnabled());
    await userEvent.click(completeButton());
    // Optimistic: unlocked before the server answers, no reload.
    await waitFor(() =>
      expect(icon("2")).toHaveAttribute("data-icon", "NOT_STARTED"),
    );
    expect(entry("2").tagName).toBe("A");
    expect(icon("3")).toHaveAttribute("data-icon", "LOCKED");

    completion.resolve(persist());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/learn/js/l-2"));
  });

  it("does not require optional lessons before the next required one", async () => {
    setup(1, "2", { sequential: true, optional: ["2"] });
    await waitFor(() =>
      expect(icon("1")).toHaveAttribute("data-icon", "COMPLETED"),
    );
    expect(icon("3")).toHaveAttribute("data-icon", "NOT_STARTED");
    expect(icon("4")).toHaveAttribute("data-icon", "LOCKED");
    // The optional lesson can be skipped.
    expect(screen.getByRole("button", { name: "Bài tiếp theo" })).toBeEnabled();
  });

  it("shows the locked state with a link to the required lesson on a direct URL", async () => {
    setup(0, "5", {
      sequential: true,
      lessonError: new ApiError(403, ["PREREQUISITE_LESSON_NOT_COMPLETED"], {
        code: "PREREQUISITE_LESSON_NOT_COMPLETED",
        requiredLesson: { id: "1", title: "Lesson 1", slug: "l-1" },
      }),
    });
    const state = await screen.findByTestId("prerequisite-locked");
    expect(state).toHaveTextContent(
      "Bạn cần hoàn thành bài Lesson 1 trước khi truy cập bài học này",
    );
    expect(
      within(state).getByRole("link", {
        name: "Đi đến bài học cần hoàn thành →",
      }),
    ).toHaveAttribute("href", "/learn/js/l-1");
  });

  it("explains a suspended enrollment instead of a generic denial", async () => {
    setup(0, "1", {
      lessonError: new ApiError(403, ["Enrollment Suspended"], {
        code: "ENROLLMENT_SUSPENDED",
      }),
    });
    expect(await screen.findByTestId("enrollment-suspended")).toHaveTextContent(
      "Quyền học đang bị tạm khóa",
    );
  });

  it("never locks non-sequential courses", async () => {
    setup(0, "1");
    await waitFor(() =>
      expect(icon("1")).toHaveAttribute("data-icon", "IN_PROGRESS"),
    );
    expect(icon("2")).toHaveAttribute("data-icon", "NOT_STARTED");
  });
});

describe("withLessonStatus", () => {
  it("recomputes required progress and never downgrades a completion", () => {
    const data = progress(9, "10");
    expect(data.percentage).toBe(45);
    const done = withLessonStatus(data, "10", "COMPLETED");
    expect(done).toMatchObject({
      completedRequiredLessons: 10,
      percentage: 50,
      isCompleted: false,
    });
    expect(withLessonStatus(done, "10", "IN_PROGRESS").percentage).toBe(50);
  });
});

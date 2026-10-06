import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurriculumNavigation } from "@/hooks/useCurriculumNavigation";
import { sequentialLocks } from "./learning-model";
import { CurriculumSidebar } from "./CurriculumSidebar";
import { LessonActionBar } from "./LessonActionBar";
import type {
  LessonProgressStatus,
  SyllabusChapter,
  SyllabusLesson,
} from "./learning-model";

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch, replace: vi.fn() }),
}));

const lesson = (id: string, position: number, isPreview = false) => ({
  id,
  title: `Lesson ${id}`,
  slug: `l-${id}`,
  type: "TEXT" as const,
  position,
  isPreview,
  isRequired: true,
});

// Positions are deliberately non-monotonic: traversal must preserve API order.
const curriculum: SyllabusChapter[] = [
  {
    id: "ch1",
    title: "Basics",
    orderIndex: 9,
    lessons: [lesson("1", 8, true), lesson("2", 2, true)],
  },
  {
    id: "ch2",
    title: "Advanced",
    orderIndex: 1,
    lessons: [lesson("3", 7), lesson("4", 0)],
  },
];

beforeEach(() => {
  push.mockReset();
  prefetch.mockReset();
});

describe("curriculum navigation", () => {
  it("preserves persisted API order and adds chapter/global metadata", () => {
    const result = buildCurriculumNavigation(curriculum, "l-2");
    expect(result.flattenedLessons.map(({ id }) => id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(
      result.flattenedLessons.map(({ globalIndex }) => globalIndex),
    ).toEqual([0, 1, 2, 3]);
    expect(result.currentLesson).toMatchObject({
      id: "2",
      chapterId: "ch1",
      chapterTitle: "Basics",
    });
  });

  it("traverses chapter boundaries and returns null at both ends", () => {
    expect(buildCurriculumNavigation(curriculum, "l-2").nextLesson?.id).toBe(
      "3",
    );
    expect(
      buildCurriculumNavigation(curriculum, "l-3").previousLesson?.id,
    ).toBe("2");
    expect(
      buildCurriculumNavigation(curriculum, "l-1").previousLesson,
    ).toBeNull();
    expect(buildCurriculumNavigation(curriculum, "l-4").nextLesson).toBeNull();
  });
});

describe("CurriculumSidebar", () => {
  it("labels optional lessons", () => {
    const optional = curriculum.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((item) =>
        item.id === "1" ? { ...item, isRequired: false } : item,
      ),
    }));
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={optional}
        activeSlug="l-1"
        statusOf={() => "NOT_STARTED"}
      />,
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("expands the active chapter, highlights and scrolls the active lesson", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug="l-3"
        statusOf={() => "NOT_STARTED"}
      />,
    );
    const active = screen.getByRole("link", { name: /Lesson 3/ });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /Advanced/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(scrollIntoView).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Basics/ }));
    expect(screen.getByRole("link", { name: /Lesson 1/ })).toHaveAttribute(
      "href",
      "/learn/course-one/l-1",
    );
  });
});

describe("LessonActionBar navigation", () => {
  const renderFooter = (activeSlug: string, locked = false) =>
    render(
      <LessonActionBar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug={activeSlug}
        isLocked={(target: SyllabusLesson) => locked && target.id === "3"}
      />,
    );

  it("prefetches both neighbors and navigates across chapters", async () => {
    renderFooter("l-2");
    expect(prefetch).toHaveBeenCalledWith("/learn/course-one/l-1");
    expect(prefetch).toHaveBeenCalledWith("/learn/course-one/l-3");
    await userEvent.click(
      screen.getByRole("button", { name: "Bài tiếp theo" }),
    );
    expect(push).toHaveBeenCalledWith("/learn/course-one/l-3");
  });

  it("disables boundary and locked navigation", () => {
    const { unmount } = renderFooter("l-1");
    expect(
      screen.getByRole("button", { name: "Quay lại bài trước" }),
    ).toBeDisabled();
    unmount();
    renderFooter("l-2", true);
    expect(
      screen.getByRole("button", { name: "Bài tiếp theo" }),
    ).toBeDisabled();
  });

  it("handles arrow/bracket shortcuts and ignores typing targets", () => {
    renderFooter("l-2");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(push).toHaveBeenCalledWith("/learn/course-one/l-3");
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "[" });
    expect(push).not.toHaveBeenCalledWith("/learn/course-one/l-1");
    input.remove();
    fireEvent.keyDown(window, { key: "[" });
    expect(push).toHaveBeenCalledWith("/learn/course-one/l-1");
  });
});

describe("CurriculumSidebar statuses", () => {
  it("renders one icon per server status and highlights the active lesson separately", () => {
    const statuses: Record<string, LessonProgressStatus> = {
      "1": "COMPLETED",
      "2": "IN_PROGRESS",
      "3": "LOCKED",
      "4": "NOT_STARTED",
    };
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={curriculum.map((chapter) => ({ ...chapter }))}
        activeSlug="l-2"
        statusOf={(item) => statuses[item.id]}
      />,
    );
    // Open the second chapter too.
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    for (const [id, status] of Object.entries(statuses))
      expect(screen.getByTestId(`lesson-status-${id}`)).toHaveAttribute(
        "data-icon",
        status,
      );
    const active = screen.getByRole("link", { name: /Lesson 2/ });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-status", "IN_PROGRESS");
    expect(screen.getByRole("link", { name: /Lesson 1/ })).toHaveTextContent(
      "Đã hoàn thành",
    );
    expect(screen.getByRole("button", { name: /Basics/ })).toHaveTextContent(
      "1/2",
    );
  });
});

describe("LessonActionBar completion", () => {
  const renderBar = (
    activeSlug: string,
    completion: Parameters<typeof LessonActionBar>[0]["completion"],
    onComplete = vi.fn(async () => true),
  ) => {
    render(
      <LessonActionBar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug={activeSlug}
        isLocked={() => false}
        completion={completion}
        onComplete={onComplete}
      />,
    );
    return onComplete;
  };

  it("blocks completion until evidence exists and explains why", () => {
    renderBar("l-2", { kind: "incomplete", hint: "Đọc ít nhất 80%" });
    expect(
      screen.getByRole("button", {
        name: "Đánh dấu Hoàn thành & Sang bài tiếp theo",
      }),
    ).toBeDisabled();
    expect(screen.getByText("Đọc ít nhất 80%")).toBeInTheDocument();
  });

  it("completes and then routes to the next lesson", async () => {
    const onComplete = renderBar("l-2", { kind: "incomplete" });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Đánh dấu Hoàn thành & Sang bài tiếp theo",
      }),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/learn/course-one/l-3");
  });

  it("stays on the lesson when completion fails or the course is finished", async () => {
    renderBar(
      "l-2",
      { kind: "incomplete" },
      vi.fn(async () => false),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Đánh dấu Hoàn thành & Sang bài tiếp theo",
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("offers course completion on the last lesson", () => {
    renderBar("l-4", { kind: "incomplete" });
    expect(
      screen.getByRole("button", { name: "Hoàn thành khóa học" }),
    ).toBeEnabled();
  });

  it("shows the done badge with next-lesson and review CTAs", () => {
    const { unmount } = render(
      <LessonActionBar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug="l-2"
        isLocked={() => false}
        completion={{ kind: "completed" }}
      />,
    );
    expect(screen.getByTestId("lesson-completed")).toHaveTextContent(
      "Đã hoàn thành",
    );
    expect(screen.getByRole("button", { name: "Bài tiếp theo" })).toBeEnabled();
    unmount();
    renderBar("l-4", { kind: "completed" });
    expect(
      screen.getByRole("button", { name: "Xem lại từ đầu" }),
    ).toBeInTheDocument();
  });
});

describe("sequentialLocks", () => {
  const done =
    (...ids: string[]) =>
    (id: string) =>
      ids.includes(id);
  const mixed: SyllabusChapter[] = [
    {
      ...curriculum[0]!,
      lessons: [
        { ...lesson("1", 0), isRequired: true },
        { ...lesson("2", 1), isRequired: false },
      ],
    },
    {
      ...curriculum[1]!,
      lessons: [lesson("3", 0), { ...lesson("4", 1), isPreview: true }],
    },
  ];
  const blockers = (completed: (id: string) => boolean) =>
    Object.fromEntries(
      [...sequentialLocks(mixed, completed)].map(([id, by]) => [id, by.id]),
    );

  it("locks everything after the first incomplete required lesson except previews", () => {
    expect(blockers(done())).toEqual({ "2": "1", "3": "1" });
  });

  it("lets optional lessons be skipped and crosses chapters", () => {
    expect(blockers(done("1"))).toEqual({});
    expect(blockers(done("1", "2"))).toEqual({});
  });

  it("re-locks behind an earlier gap even if later lessons were completed", () => {
    // e.g. the course became sequential after the student skipped ahead.
    expect(blockers(done("3"))).toEqual({ "2": "1", "3": "1" });
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCurriculumNavigation } from "@/hooks/useCurriculumNavigation";
import { CurriculumSidebar } from "./CurriculumSidebar";
import { LearningFooter } from "./LearningFooter";
import type { SyllabusChapter } from "./learning-model";

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
        completed={new Set()}
        isLocked={() => false}
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
        completed={new Set()}
        isLocked={() => false}
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

describe("LearningFooter", () => {
  const renderFooter = (activeSlug: string, locked = false) =>
    render(
      <LearningFooter
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug={activeSlug}
        isLocked={(target) => locked && target.id === "3"}
      />,
    );

  it("prefetches both neighbors and navigates across chapters", async () => {
    renderFooter("l-2");
    expect(prefetch).toHaveBeenCalledWith("/learn/course-one/l-1");
    expect(prefetch).toHaveBeenCalledWith("/learn/course-one/l-3");
    await userEvent.click(screen.getByRole("button", { name: "Next Lesson" }));
    expect(push).toHaveBeenCalledWith("/learn/course-one/l-3");
  });

  it("disables boundary and locked navigation", () => {
    const { unmount } = renderFooter("l-1");
    expect(
      screen.getByRole("button", { name: "Previous Lesson" }),
    ).toBeDisabled();
    unmount();
    renderFooter("l-2", true);
    expect(screen.getByRole("button", { name: "Next Lesson" })).toBeDisabled();
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

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CourseQuiz } from "@/features/quiz-player/api";
import { CurriculumSidebar } from "../CurriculumSidebar";
import { sequentialLocks, type SyllabusChapter } from "../learning-model";
import { LessonQuizCallout } from "./LessonQuizCallout";
import {
  AutosaveQueue,
  canRetry,
  formatRemaining,
  nextLessonAfterQuiz,
  stepCompletedBy,
} from "./quiz-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}));

const lesson = (id: string, isRequired = true) => ({
  id,
  title: `Lesson ${id}`,
  slug: `l-${id}`,
  type: "TEXT" as const,
  position: 0,
  isPreview: false,
  isRequired,
});
const curriculum: SyllabusChapter[] = [
  {
    id: "ch1",
    title: "Basics",
    orderIndex: 0,
    lessons: [lesson("1"), lesson("2")],
  },
  { id: "ch2", title: "Advanced", orderIndex: 1, lessons: [lesson("3")] },
];

const quiz = (
  id: string,
  scope: CourseQuiz["scope"],
  targetId: string,
  extra: Partial<CourseQuiz> = {},
): CourseQuiz => ({
  id,
  slug: null,
  title: `Quiz ${id}`,
  description: null,
  scope,
  targetId,
  isRequired: true,
  passingScore: 80,
  durationMinutes: null,
  maxAttempts: 3,
  totalQuestions: 5,
  totalPoints: 10,
  reviewPolicy: "AFTER_SUBMIT",
  attemptsUsed: 0,
  attemptsRemaining: 3,
  hasActiveAttempt: false,
  isPassed: false,
  status: "NOT_STARTED",
  stepCompleted: false,
  latestAttemptId: null,
  ...extra,
});

describe("quiz completion gate", () => {
  it("needs a pass for a required quiz, any submission for an optional one", () => {
    expect(stepCompletedBy({ isRequired: true }, false)).toBe(false);
    expect(stepCompletedBy({ isRequired: true }, true)).toBe(true);
    expect(stepCompletedBy({ isRequired: false }, false)).toBe(true);
  });

  it("offers a retry while attempts remain", () => {
    expect(canRetry({ attemptsRemaining: null })).toBe(true);
    expect(canRetry({ attemptsRemaining: 1 })).toBe(true);
    expect(canRetry({ attemptsRemaining: 0 })).toBe(false);
  });

  it("continues to the lesson after a lesson quiz and the next chapter after a chapter quiz", () => {
    expect(
      nextLessonAfterQuiz(curriculum, { scope: "LESSON", targetId: "1" })?.id,
    ).toBe("2");
    expect(
      nextLessonAfterQuiz(curriculum, { scope: "LESSON", targetId: "3" }),
    ).toBeNull();
    expect(
      nextLessonAfterQuiz(curriculum, { scope: "CHAPTER", targetId: "ch1" })
        ?.id,
    ).toBe("3");
    expect(
      nextLessonAfterQuiz(curriculum, { scope: "COURSE", targetId: "c1" }),
    ).toBeNull();
  });

  it("formats the server-time countdown", () => {
    expect(formatRemaining(65_000)).toBe("01:05");
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
    expect(formatRemaining(-5_000)).toBe("00:00");
  });
});

describe("sequential locks with quizzes", () => {
  it("locks later lessons behind a completed lesson's unpassed required quiz", () => {
    const done = () => true;
    const locks = sequentialLocks(curriculum, done, (id) =>
      id === "1" ? "qz" : null,
    );
    expect(locks.get("2")).toEqual({
      id: "1",
      title: "Lesson 1",
      slug: "l-1",
      quizId: "qz",
    });
    expect(locks.get("3")).toMatchObject({ id: "1", quizId: "qz" });
    expect(locks.has("1")).toBe(false);
    // Passing it lifts every lock.
    expect(sequentialLocks(curriculum, done, () => null).size).toBe(0);
  });

  it("points to the lesson itself while it is not completed", () => {
    const locks = sequentialLocks(
      curriculum,
      () => false,
      (id) => (id === "1" ? "qz" : null),
    );
    expect(locks.get("2")).toEqual({ id: "1", title: "Lesson 1", slug: "l-1" });
  });
});

describe("AutosaveQueue", () => {
  it("keeps per-question saves in order and sends only the newest pending one", async () => {
    const sent: string[][] = [];
    const releases: Array<() => void> = [];
    const states: string[] = [];
    const queue = new AutosaveQueue(
      (_question, selection) =>
        new Promise<void>((resolve) => {
          sent.push(selection);
          releases.push(resolve);
        }),
      (_question, state) => states.push(state),
    );
    queue.save("q1", ["a"]);
    queue.save("q1", ["b"]);
    queue.save("q1", ["c"]);
    expect(sent).toEqual([["a"]]);
    releases.shift()!();
    await vi.waitFor(() => expect(sent).toEqual([["a"], ["c"]]));
    releases.shift()!();
    await queue.flush();
    expect(sent).toEqual([["a"], ["c"]]);
    expect(states.at(-1)).toBe("saved");
  });

  it("still sends a newer selection after a failed save", async () => {
    const sent: string[][] = [];
    let fail = true;
    const errors: unknown[] = [];
    const queue = new AutosaveQueue(
      async (_question, selection) => {
        sent.push(selection);
        if (fail) {
          fail = false;
          await Promise.resolve();
          throw new Error("offline");
        }
      },
      (_question, state, error) => state === "error" && errors.push(error),
    );
    queue.save("q1", ["a"]);
    queue.save("q1", ["b"]);
    await queue.flush();
    expect(sent).toEqual([["a"], ["b"]]);
    // The failure was superseded by a successful newer save.
    expect(errors).toEqual([]);
  });
});

describe("course player quiz items", () => {
  const quizzes = [
    quiz("lq", "LESSON", "1", {
      status: "PASSED",
      isPassed: true,
      stepCompleted: true,
    }),
    quiz("cq", "CHAPTER", "ch1", {
      status: "FAILED",
      isRequired: false,
      stepCompleted: true,
    }),
    quiz("fq", "COURSE", "c1", { status: "IN_PROGRESS" }),
  ];
  const quizzesOf = (scope: CourseQuiz["scope"], targetId: string) =>
    quizzes.filter(
      (item) => item.scope === scope && item.targetId === targetId,
    );

  it("places lesson, chapter and course quizzes with status badges", () => {
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug="l-1"
        statusOf={() => "NOT_STARTED"}
        quizzesOf={quizzesOf}
        courseId="c1"
        activeQuizId="cq"
      />,
    );
    const items = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    // Lesson quiz right after its lesson; chapter quiz at the chapter's end.
    const labels = ["Quiz lq", "Quiz cq", "Quiz fq", "Lesson 1", "Lesson 2"];
    const ids = ["lq", "cq", "fq", "1", "2"];
    const order = items.map((text) => {
      const index = labels.findIndex((label) => text.includes(label));
      return index === -1 ? "?" : ids[index]!;
    });
    expect(order.filter((id) => id !== "?")).toEqual([
      "1",
      "lq",
      "2",
      "cq",
      "fq",
    ]);
    expect(screen.getByTestId("quiz-status-lq")).toHaveTextContent("Đạt");
    expect(screen.getByTestId("quiz-status-cq")).toHaveTextContent("Chưa đạt");
    expect(screen.getByTestId("quiz-status-fq")).toHaveTextContent("Đang làm");
    expect(
      within(screen.getByTestId("quiz-item-lq")).getByRole("link"),
    ).toHaveAttribute("href", "/learn/course-one/quiz/lq");
    expect(
      within(screen.getByTestId("quiz-item-cq")).getByRole("link"),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Kiểm tra cuối khóa")).toBeInTheDocument();
  });

  it("renders a locked quiz as not navigable", () => {
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={curriculum}
        activeSlug="l-1"
        statusOf={() => "NOT_STARTED"}
        quizzesOf={quizzesOf}
        isQuizLocked={(item) => item.id === "lq"}
      />,
    );
    const locked = screen.getByTestId("quiz-item-lq");
    expect(
      within(locked).queryByRole("link", { name: /Quiz lq/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("invites the learner to the lesson's quiz", () => {
    render(
      <LessonQuizCallout
        courseSlug="course-one"
        quiz={quizzes[0]!}
        locked={false}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Xem lại bài quiz" }),
    ).toHaveAttribute("href", "/learn/course-one/quiz/lq");
    render(
      <LessonQuizCallout
        courseSlug="course-one"
        quiz={quiz("x", "LESSON", "2", { status: "FAILED" })}
        locked={false}
      />,
    );
    expect(
      screen.getByText(/cần đạt để mở khóa bài tiếp theo/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Làm lại bài quiz" }),
    ).toBeInTheDocument();
  });
});

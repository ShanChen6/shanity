import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { homeForRoles, postLoginRedirect } from "@/lib/auth-redirect";
import { LearningCourseCard } from "./my-learning";
import {
  courseAction,
  filterCourses,
  parseFilter,
  parseSort,
  sortCourses,
  type EnrolledCourse,
} from "./my-learning-model";

vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({ user: null }),
}));

const course = (
  title: string,
  slug: string,
  percentage: number,
  lastAccessedAt: string | null,
  lastAccessedLessonSlug: string | null = null,
): EnrolledCourse => ({
  courseId: slug,
  title,
  slug,
  thumbnailUrl: null,
  instructorName: "Shanity Team",
  progress: {
    percentage,
    completedRequiredLessons: Math.round(percentage / 4),
    totalRequiredLessons: 25,
    lastAccessedLessonSlug,
    lastAccessedAt,
  },
});

// Server order: last accessed DESC, never-opened last.
const react = course(
  "React Fundamentals",
  "react-fundamentals",
  72,
  "2026-10-06T10:00:00.000Z",
  "react-hooks-overview",
);
const nest = course(
  "NestJS Fundamentals",
  "nestjs-fundamentals",
  18,
  "2026-10-06T11:00:00.000Z",
  "modules",
);
const js = course(
  "JavaScript Basics",
  "javascript-basics",
  45,
  "2026-10-04T09:00:00.000Z",
  "closures",
);
const done = course("Git Basics", "git-basics", 100, null, "rebase");
const fresh = course("CSS Grid", "css-grid", 0, null);
const all = [react, nest, js, done, fresh];

describe("my learning model", () => {
  it("filters into in-progress (including not started) and completed", () => {
    expect(filterCourses(all, "all")).toHaveLength(5);
    expect(filterCourses(all, "in-progress").map((c) => c.slug)).toEqual([
      "react-fundamentals",
      "nestjs-fundamentals",
      "javascript-basics",
      "css-grid",
    ]);
    expect(filterCourses(all, "completed").map((c) => c.slug)).toEqual([
      "git-basics",
    ]);
  });

  it("sorts by most recent access with never-opened courses last", () => {
    expect(sortCourses(all, "recent").map((c) => c.slug)).toEqual([
      "nestjs-fundamentals",
      "react-fundamentals",
      "javascript-basics",
      "git-basics",
      "css-grid",
    ]);
  });

  it("sorts by progress descending", () => {
    expect(
      sortCourses(all, "progress").map((c) => c.progress.percentage),
    ).toEqual([100, 72, 45, 18, 0]);
  });

  it("ignores unknown filter and sort values from the URL", () => {
    expect(parseFilter("hacked")).toBe("all");
    expect(parseFilter("completed")).toBe("completed");
    expect(parseSort(null)).toBe("recent");
    expect(parseSort("progress")).toBe("progress");
  });

  it("picks the CTA from progress and resumes the server lesson pointer", () => {
    expect(courseAction(react)).toEqual({
      kind: "resume",
      label: "Tiếp tục học",
      href: "/learn/react-fundamentals/react-hooks-overview",
    });
    expect(courseAction(fresh)).toEqual({
      kind: "start",
      label: "Bắt đầu học",
      href: "/learn/css-grid",
    });
    expect(courseAction(done)).toEqual({
      kind: "review",
      label: "Xem lại bài học",
      href: "/learn/git-basics",
    });
    // In progress without a pointer still lands on the course's first lesson.
    expect(courseAction(course("X", "x", 30, null)).href).toBe("/learn/x");
  });
});

describe("LearningCourseCard", () => {
  it("shows title, instructor, percentage, required lesson count and resume CTA", () => {
    render(<LearningCourseCard course={react} />);
    const card = screen.getByRole("article", { name: "React Fundamentals" });
    expect(within(card).getByText("Shanity Team")).toBeInTheDocument();
    expect(within(card).getByText("72%")).toBeInTheDocument();
    expect(
      within(card).getByRole("progressbar", {
        name: "Tiến độ React Fundamentals",
      }),
    ).toHaveAttribute("aria-valuenow", "72");
    expect(card).toHaveTextContent("Đã hoàn thành 18/25 bài học bắt buộc");
    expect(
      within(card).getByRole("link", { name: /Tiếp tục học/ }),
    ).toHaveAttribute("href", "/learn/react-fundamentals/react-hooks-overview");
  });

  it("shows a completed badge and review CTA at 100%", () => {
    render(<LearningCourseCard course={done} />);
    const card = screen.getByRole("article", { name: "Git Basics" });
    expect(within(card).getByText("Đã hoàn thành")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Xem lại bài học" }),
    ).toHaveAttribute("href", "/learn/git-basics");
  });
});

describe("post-login redirect", () => {
  it("lands each role on its home when no redirect is given", () => {
    expect(homeForRoles(["student"])).toBe("/my-learning");
    expect(homeForRoles(["student", "instructor"])).toBe("/instructor/courses");
    expect(homeForRoles(["student", "admin"])).toBe("/admin");
    expect(postLoginRedirect(null, ["student"])).toBe("/my-learning");
  });

  it("honors a safe redirect and rejects unsafe ones", () => {
    expect(postLoginRedirect("/courses/js-basics", ["student"])).toBe(
      "/courses/js-basics",
    );
    for (const unsafe of ["https://evil.example", "//evil.example", "/login"])
      expect(postLoginRedirect(unsafe, ["student"])).toBe("/my-learning");
  });
});

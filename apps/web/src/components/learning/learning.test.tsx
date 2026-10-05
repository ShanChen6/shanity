import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurriculumSidebar } from "./CurriculumSidebar";
import { LearningFooter } from "./LearningFooter";
import { LearningShell } from "./LearningShell";
import { LessonContentViewer } from "./LessonContentViewer";
import {
  getAdjacentLessons,
  sortCurriculum,
  type Syllabus,
  type SyllabusChapter,
} from "./learning-model";

let params: Record<string, string> = {};
let session: { user: unknown; isAuthenticated: boolean } = { user: null, isAuthenticated: false };

vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/features/auth/session-provider", () => ({ useSession: () => session }));

const lesson = (id: string, position: number, extra = {}) => ({
  id,
  title: `Lesson ${id}`,
  slug: `l-${id}`,
  type: "TEXT" as const,
  position,
  isPreview: false,
  ...extra,
});

// Intentionally unsorted input.
const curriculum: SyllabusChapter[] = [
  { id: "ch2", title: "Advanced", orderIndex: 1, lessons: [lesson("4", 1), lesson("3", 0)] },
  { id: "ch1", title: "Basics", orderIndex: 0, lessons: [lesson("2", 1, { isPreview: true }), lesson("1", 0, { isPreview: true })] },
];
const sorted = sortCurriculum(curriculum);
const syllabus: Syllabus = {
  course: { id: "course-1", title: "Course One", slug: "course-one" },
  instructor: { id: "teacher" },
  curriculum,
};

describe("learning model", () => {
  it("orders chapters and lessons by position", () => {
    expect(sorted.map((c) => c.id)).toEqual(["ch1", "ch2"]);
    expect(sorted.flatMap((c) => c.lessons.map((l) => l.id))).toEqual(["1", "2", "3", "4"]);
  });

  it("finds previous/next across chapter boundaries", () => {
    expect(getAdjacentLessons(sorted, "l-2").next?.slug).toBe("l-3");
    expect(getAdjacentLessons(sorted, "l-3").previous?.slug).toBe("l-2");
    expect(getAdjacentLessons(sorted, "l-1").previous).toBeNull();
    expect(getAdjacentLessons(sorted, "l-4").next).toBeNull();
    expect(getAdjacentLessons(sorted, "missing")).toEqual({ current: null, previous: null, next: null });
  });
});

describe("CurriculumSidebar", () => {
  it("renders chapters, links and status indicators", () => {
    render(
      <CurriculumSidebar
        courseSlug="course-one"
        curriculum={sorted}
        activeSlug="l-2"
        completed={new Set(["1"])}
        isLocked={(l) => !l.isPreview}
      />,
    );
    expect(screen.getByText(/Chương 1: Basics/)).toBeInTheDocument();
    expect(screen.getByText(/Chương 2: Advanced/)).toBeInTheDocument();
    const link = (title: string) => screen.getByRole("link", { name: new RegExp(title) });
    expect(link("Lesson 1")).toHaveAttribute("data-status", "completed");
    expect(link("Lesson 1")).toHaveTextContent("✓");
    expect(link("Lesson 2")).toHaveAttribute("data-status", "active");
    expect(link("Lesson 2")).toHaveAttribute("aria-current", "page");
    expect(link("Lesson 2")).toHaveTextContent("→");
    expect(link("Lesson 3")).toHaveAttribute("data-status", "locked");
    expect(link("Lesson 3")).toHaveTextContent("🔒");
    expect(link("Lesson 3")).toHaveAttribute("href", "/learn/course-one/l-3");
  });

  it("marks unlocked preview lessons with the preview indicator", () => {
    render(
      <CurriculumSidebar courseSlug="c" curriculum={sorted} completed={new Set()} isLocked={(l) => !l.isPreview} />,
    );
    expect(screen.getByRole("link", { name: /Lesson 1/ })).toHaveTextContent("👁️");
  });
});

describe("LearningFooter", () => {
  const footer = (active: string, locked: (slug: string) => boolean = () => false) =>
    render(
      <LearningFooter courseSlug="c" curriculum={sorted} activeSlug={active} isLocked={(l) => locked(l.slug)} />,
    );

  it("disables Previous on the first lesson", () => {
    footer("l-1");
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/learn/c/l-2");
  });

  it("crosses chapter boundaries", () => {
    footer("l-3");
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/learn/c/l-2");
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/learn/c/l-4");
  });

  it("disables Next on the last lesson or when the next lesson is locked", () => {
    const { unmount } = footer("l-4");
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    unmount();
    footer("l-2", (slug) => slug === "l-3");
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });
});

describe("learning shell", () => {
  let lessonStatus = 200;
  let syllabusStatus = 200;
  beforeEach(() => {
    lessonStatus = 200;
    syllabusStatus = 200;
    params = { courseSlug: "course-one", lessonSlug: "l-1" };
    session = { user: null, isAuthenticated: false };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
        if (url.endsWith("/syllabus")) return json(syllabusStatus === 200 ? syllabus : {}, syllabusStatus);
        if (url.includes("/lessons/"))
          return json(lessonStatus === 200 ? { id: "1", title: "Lesson 1", type: "TEXT", content: "<p>Body</p>" } : { message: "x" }, lessonStatus);
        return json({}, 404);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows skeletons then the sidebar and lesson", async () => {
    render(<LearningShell courseSlug="course-one"><LessonContentViewer lessonSlug="l-1" /></LearningShell>);
    expect(screen.getByRole("status", { name: "Đang tải bài học" })).toBeInTheDocument();
    expect(await screen.findByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Course One" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Giáo trình" })).toBeInTheDocument();
  });

  it("shows the locked state with Enroll Now for a signed-in student on 403", async () => {
    lessonStatus = 403;
    session = { user: { id: "s1", roles: ["student"] }, isAuthenticated: true };
    render(<LearningShell courseSlug="course-one"><LessonContentViewer lessonSlug="l-3" /></LearningShell>);
    expect(await screen.findByText("Khóa học này yêu cầu Đăng ký")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enroll Now" })).toBeInTheDocument();
  });

  it("asks guests to sign in on 401", async () => {
    lessonStatus = 401;
    render(<LearningShell courseSlug="course-one"><LessonContentViewer lessonSlug="l-3" /></LearningShell>);
    const login = await screen.findByRole("link", { name: "Đăng nhập" });
    expect(login.getAttribute("href")).toContain("/login?redirect=");
  });

  it("shows not found for an unknown course and an unknown lesson", async () => {
    syllabusStatus = 404;
    const { unmount } = render(<LearningShell courseSlug="x"><div /></LearningShell>);
    expect(await screen.findByText("Không tìm thấy khóa học")).toBeInTheDocument();
    unmount();
    syllabusStatus = 200;
    render(<LearningShell courseSlug="course-one"><LessonContentViewer lessonSlug="nope" /></LearningShell>);
    expect(await screen.findByText("Không tìm thấy bài học")).toBeInTheDocument();
  });

  it("collapses the sidebar into a drawer that closes after choosing a lesson", async () => {
    const user = userEvent.setup();
    render(<LearningShell courseSlug="course-one"><div>child</div></LearningShell>);
    const toggle = await screen.findByRole("button", { name: "Mở giáo trình" });
    expect(document.querySelector("dialog[open]")).toBeNull();
    await user.click(toggle);
    const drawer = document.querySelector("dialog[open]") as HTMLElement;
    expect(drawer).not.toBeNull();
    await user.click(within(drawer).getByRole("link", { name: /Lesson 2/ }));
    await waitFor(() => expect(document.querySelector("dialog[open]")).toBeNull());
  });
});

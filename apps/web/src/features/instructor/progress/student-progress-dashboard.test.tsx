import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { parseProgressQuery, relativeTime } from "./api";
import { StudentProgressDashboard } from "./student-progress-dashboard";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/instructor/courses/c1/progress",
  useSearchParams: () => search,
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const student = (
  id: string,
  fullName: string,
  percentage: number,
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED",
) => ({
  studentId: id,
  fullName,
  email: `${id}@example.com`,
  avatarUrl: null,
  enrolledAt: "2026-09-01T08:00:00.000Z",
  lastAccessedAt: "2026-10-06T14:20:00.000Z",
  status,
  progress: {
    percentage,
    completedLessons: Math.round((percentage * 30) / 100),
    totalLessons: 30,
    completedRequiredLessons: Math.round((percentage * 30) / 100),
    totalRequiredLessons: 30,
  },
});
const response = {
  course: {
    id: "c1",
    title: "NestJS Fundamentals",
    totalStudents: 128,
    avgProgressPercentage: 58.5,
    completedStudents: 16,
    completionRate: 12.5,
  },
  students: [
    student("a", "Student A", 80, "IN_PROGRESS"),
    student("b", "Student B", 45, "IN_PROGRESS"),
    student("c", "Student C", 10, "IN_PROGRESS"),
  ],
  pagination: { page: 1, limit: 20, totalItems: 3, totalPages: 1 },
};

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StudentProgressDashboard courseId="c1" />
    </QueryClientProvider>,
  );
}
const lastApiPath = () => String(apiMock.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockReset();
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    if (path.includes("/students/"))
      return {
        studentId: "b",
        fullName: "Student B",
        email: "b@example.com",
        lessons: [
          {
            lessonId: "l1",
            title: "Modules",
            chapterTitle: "Core",
            isRequired: true,
            status: "COMPLETED",
            completedAt: "2026-10-01T00:00:00.000Z",
          },
          {
            lessonId: "l2",
            title: "Providers",
            chapterTitle: "Core",
            isRequired: true,
            status: "NOT_STARTED",
            completedAt: null,
          },
        ],
      };
    return response;
  });
});

describe("StudentProgressDashboard", () => {
  it("shows summary cards and each student's exact progress", async () => {
    renderDashboard();
    expect(await screen.findByText("Student A")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("58.5%")).toBeInTheDocument();
    expect(screen.getByText("16 (12.5%)")).toBeInTheDocument();
    for (const [id, name, value] of [
      ["a", "Student A", "80"],
      ["b", "Student B", "45"],
      ["c", "Student C", "10"],
    ] as const) {
      const row = screen.getByTestId(`student-row-${id}`);
      expect(row).toHaveTextContent(`${value}%`);
      expect(
        within(row).getByRole("progressbar", { name: `Tiến độ của ${name}` }),
      ).toHaveAttribute("aria-valuenow", value);
      expect(row).toHaveTextContent("Đang học");
    }
    expect(lastApiPath()).toBe(
      "/api/v1/instructor/courses/c1/students-progress?page=1&limit=20&sortBy=last_accessed_desc&status=ALL",
    );
  });

  it("debounces search into the URL and sends it to the API", async () => {
    const { unmount } = renderDashboard();
    await screen.findByText("Student A");
    await userEvent.type(
      screen.getByLabelText("Tìm kiếm học viên"),
      "Student B",
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/instructor/courses/c1/progress?search=Student+B",
        { scroll: false },
      ),
    );
    unmount();
    // The URL drives the request.
    search = new URLSearchParams("search=Student B");
    renderDashboard();
    await waitFor(() => expect(lastApiPath()).toContain("&search=Student+B"));
  });

  it("filters by status and toggles the progress sort", async () => {
    renderDashboard();
    await screen.findByText("Student A");
    fireEvent.change(screen.getByLabelText("Trạng thái"), {
      target: { value: "COMPLETED" },
    });
    expect(replace).toHaveBeenLastCalledWith(
      "/instructor/courses/c1/progress?status=COMPLETED",
      { scroll: false },
    );
    await userEvent.click(screen.getByRole("button", { name: /Tiến độ/ }));
    expect(replace).toHaveBeenLastCalledWith(
      "/instructor/courses/c1/progress?sortBy=percentage_desc",
      { scroll: false },
    );
  });

  it("opens a drawer listing the student's completed lessons", async () => {
    renderDashboard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Student B" }),
    );
    expect(await screen.findByText("Modules")).toBeInTheDocument();
    expect(lastApiPath()).toBe(
      "/api/v1/instructor/courses/c1/students/b/progress",
    );
    expect(
      screen.getByText("Modules").closest("[data-status]"),
    ).toHaveAttribute("data-status", "COMPLETED");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Đã hoàn thành 1/2 bài học",
    );
  });

  it("shows 403 Access Denied when the API refuses the course", async () => {
    apiMock.mockRejectedValue(new ApiError(403, ["Forbidden"]));
    renderDashboard();
    expect(await screen.findByTestId("course-access-denied")).toHaveTextContent(
      "403",
    );
    expect(
      screen.getByRole("link", { name: /Về danh sách khóa học/ }),
    ).toHaveAttribute("href", "/instructor/courses");
    expect(screen.queryByText("Student A")).not.toBeInTheDocument();
  });
});

describe("progress query helpers", () => {
  it("sanitizes untrusted URL params", () => {
    expect(
      parseProgressQuery(
        new URLSearchParams("page=-3&status=HACKED&sortBy=drop&search=x"),
      ),
    ).toEqual({
      page: 1,
      limit: 20,
      search: "x",
      status: "ALL",
      sortBy: "last_accessed_desc",
    });
  });

  it("formats relative activity", () => {
    const now = Date.parse("2026-10-06T16:20:00.000Z");
    expect(relativeTime("2026-10-06T14:20:00.000Z", now)).toBe("2 giờ trước");
    expect(relativeTime(null, now)).toBe("Chưa truy cập");
  });
});

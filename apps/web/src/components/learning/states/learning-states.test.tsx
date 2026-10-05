import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonContentRenderer } from "../renderers/LessonContentRenderer";
import type { LessonData } from "../renderers/types";
import { AccessDeniedCard } from "./AccessDeniedCard";
import { LearningSkeletonLoader } from "./LearningSkeletonLoader";
import { MobileCurriculumSheet } from "./MobileCurriculumSheet";
import { NotFoundCard } from "./NotFoundCard";
import { LEARNING_RESUME_KEY, SessionExpiredState } from "./SessionExpiredState";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const access = { canView: true, canDownload: false };
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("learning failure and responsive states", () => {
  beforeEach(() => replace.mockReset());
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders content/sidebar skeletons and a responsive mobile sheet", () => {
    const { unmount } = render(<LearningSkeletonLoader />);
    expect(screen.getByRole("status", { name: "Đang tải giao diện học tập" })).toBeInTheDocument();
    unmount();
    render(
      <MobileCurriculumSheet open onClose={vi.fn()}>
        <p>Curriculum</p>
      </MobileCurriculumSheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("max-md:h-[82dvh]", "lg:hidden");
    expect(screen.getByText("Curriculum")).toBeInTheDocument();
  });

  it("shows dedicated access-denied and not-found cards", () => {
    const { unmount } = render(<AccessDeniedCard courseSlug="paid-course" />);
    expect(screen.getByRole("alert")).toHaveTextContent("nội dung trả phí");
    expect(screen.getByRole("link", { name: /Mua khóa học/ })).toHaveAttribute(
      "href",
      "/courses/paid-course",
    );
    unmount();
    render(<NotFoundCard scope="lesson" />);
    expect(screen.getByRole("link", { name: /Quay lại danh sách/ })).toHaveAttribute(
      "href",
      "/courses",
    );
  });

  it("stores the current lesson and redirects after session expiration", () => {
    vi.useFakeTimers();
    render(<SessionExpiredState courseSlug="course" lessonSlug="lesson" />);
    expect(localStorage.getItem(LEARNING_RESUME_KEY)).toBe("/learn/course/lesson");
    vi.advanceTimersByTime(900);
    expect(replace).toHaveBeenCalledWith(
      "/login?redirect=%2Flearn%2Fcourse%2Flesson",
    );
  });

  it("replaces a failed video with a retry fallback", () => {
    const lesson: LessonData = {
      id: "video-1",
      title: "Video",
      type: "VIDEO",
      videoProvider: "EXTERNAL_EMBED",
      videoExternalUrl: "https://cdn.example.test/broken.mp4",
    };
    render(
      <QueryClientProvider client={client()}>
        <LessonContentRenderer lesson={lesson} userAccess={access} />
      </QueryClientProvider>,
    );
    fireEvent.error(screen.getByTestId("video-lesson-renderer"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể tải video bài học này",
    );
    expect(screen.getByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });

  it("replaces a failed document with a missing-file fallback", async () => {
    const lesson: LessonData = {
      id: "document-1",
      title: "Document",
      type: "DOCUMENT",
      fileName: "missing.pdf",
      fileType: "PDF",
      allowDownload: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    render(
      <QueryClientProvider client={client()}>
        <LessonContentRenderer lesson={lesson} userAccess={access} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tài liệu bài học không tồn tại hoặc đã bị xóa",
    );
  });
});

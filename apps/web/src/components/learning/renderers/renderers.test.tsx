import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LessonContentRenderer } from "./LessonContentRenderer";
import type { LessonData } from "./types";

const access = { canView: true, canDownload: true };
const lesson = (overrides: Partial<LessonData>): LessonData => ({
  id: "lesson-1",
  title: "Lesson",
  type: "TEXT",
  content: "<p>Body</p>",
  ...overrides,
});

describe("LessonContentRenderer", () => {
  it("dispatches TEXT lessons to the text strategy", () => {
    render(<LessonContentRenderer lesson={lesson({})} userAccess={access} />);
    expect(screen.getByTestId("text-lesson-renderer")).toHaveTextContent("Body");
  });

  it("removes scripts and inline handlers from HTML", () => {
    render(
      <LessonContentRenderer
        lesson={lesson({
          content:
            '<script>alert("xss")</script><h1>Safe</h1><img src="x" onerror="alert(1)">',
        })}
        userAccess={access}
      />,
    );
    const renderer = screen.getByTestId("text-lesson-renderer");
    expect(renderer.querySelector("script")).toBeNull();
    expect(renderer.querySelector("img")).not.toHaveAttribute("onerror");
    expect(renderer).toHaveTextContent("Safe");
  });

  it("renders Editor.js blocks as React nodes without HTML injection", () => {
    render(
      <LessonContentRenderer
        lesson={lesson({
          content: {
            blocks: [
              { type: "header", data: { level: 2, text: "Editor content" } },
              { type: "paragraph", data: { text: "<script>bad()</script>" } },
            ],
          },
        })}
        userAccess={access}
      />,
    );
    expect(screen.getByRole("heading", { name: "Editor content" })).toBeInTheDocument();
    expect(screen.queryByRole("script")).not.toBeInTheDocument();
    expect(screen.getByText("<script>bad()</script>")).toBeInTheDocument();
  });

  it("hides document downloads when allowDownload is false", () => {
    render(
      <LessonContentRenderer
        lesson={lesson({
          type: "DOCUMENT",
          fileName: "private.pdf",
          fileType: "PDF",
          allowDownload: false,
        })}
        userAccess={access}
      />,
    );
    expect(screen.getByTestId("document-lesson-renderer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tải tài liệu/ })).toBeNull();
  });

  it("renders a safe fallback for an unknown type", () => {
    const unknown = lesson({ type: "TEXT" }) as LessonData & { type: "QUIZ" };
    Object.assign(unknown, { type: "QUIZ" });
    render(
      <LessonContentRenderer
        lesson={unknown as unknown as LessonData}
        userAccess={access}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported Lesson Type");
  });

  it("fires completion once after ninety percent video progress", () => {
    const onComplete = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <LessonContentRenderer
          lesson={lesson({
            type: "VIDEO",
            videoProvider: "EXTERNAL_EMBED",
            videoExternalUrl: "https://cdn.example.test/video.mp4",
          })}
          userAccess={access}
          onComplete={onComplete}
        />
      </QueryClientProvider>,
    );
    const video = screen.getByTestId("video-lesson-renderer") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 100 },
      currentTime: { configurable: true, value: 91 },
    });
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

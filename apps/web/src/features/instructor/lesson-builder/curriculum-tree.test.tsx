import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurriculumTree } from "./CurriculumTree";
import { useChapterLessons, useLessonMutations } from "./lesson-api";
import { reorderAfterDrag, toReorderPayload } from "./reorder";
import { lessonFormSchema } from "./schema";
import type { ApiLesson, LessonType } from "./types";

const API = "http://localhost:4000";

function lesson(
  id: string,
  type: LessonType,
  position: number,
  extra: Partial<ApiLesson> = {},
): ApiLesson {
  return {
    id,
    courseId: "c1",
    chapterId: "ch1",
    title: `Lesson ${id}`,
    slug: `lesson-${id}`,
    type,
    position,
    isPreview: false,
    isPublished: false,
    isRequired: true,
    textBody: type === "TEXT" ? "<p>hi</p>" : null,
    videoAssetId: null,
    videoExternalUrl: null,
    videoProvider: null,
    videoDurationSeconds: null,
    videoFileSize: null,
    videoMimeType: null,
    documentAssetId: null,
    documentFileName: null,
    documentFileSize: null,
    documentMimeType: null,
    documentFileType: null,
    documentDownloadAllowed: null,
    ...extra,
  };
}

type Call = { method: string; path: string; body: unknown };
let store: ApiLesson[];
let calls: Call[];
let failReorder = false;

function installBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API, "");
      const method = init.method ?? "GET";
      const body =
        typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      const reply = (data: unknown, status = 200) =>
        new Response(status === 204 ? null : JSON.stringify(data), { status });
      if (method === "GET") return reply(store);
      if (path.endsWith("/lessons/reorder")) {
        if (failReorder) return reply({ message: "boom" }, 500);
        const order = body.lessonOrders as { id: string; position: number }[];
        store = store.map((item) => ({
          ...item,
          position: order.find((entry) => entry.id === item.id)!.position,
        }));
        return reply({});
      }
      if (method === "POST") {
        const created = lesson(
          `n${store.length + 1}`,
          body.type,
          store.length,
          {
            title: body.title,
            isPreview: body.isPreview,
            isRequired: body.isRequired,
          },
        );
        store = [...store, created];
        return reply(created, 201);
      }
      if (method === "PATCH") {
        const id = path.split("/").pop()!;
        store = store.map((item) =>
          item.id === id ? { ...item, ...body } : item,
        );
        return reply(store.find((item) => item.id === id));
      }
      if (method === "DELETE") {
        store = store.filter((item) => path.endsWith(`/${item.id}`) === false);
        return reply(null, 204);
      }
      return reply({}, 404);
    }),
  );
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  store = [
    lesson("a", "TEXT", 0),
    lesson("b", "VIDEO", 1, { isPreview: true }),
    lesson("c", "DOCUMENT", 2),
  ];
  calls = [];
  failReorder = false;
  installBackend();
});
afterEach(() => vi.unstubAllGlobals());

const renderTree = () =>
  render(<CurriculumTree courseId="c1" chapterId="ch1" />, {
    wrapper: wrapper(),
  });

describe("curriculum tree rendering", () => {
  it("renders a type badge per lesson in position order, with Preview badge", async () => {
    renderTree();
    const items = await screen.findAllByTestId(/^lesson-item-/);
    expect(
      items.map(
        (item) => within(item).getByTestId("lesson-type-badge").textContent,
      ),
    ).toEqual([
      expect.stringContaining("TEXT"),
      expect.stringContaining("VIDEO"),
      expect.stringContaining("DOCUMENT"),
    ]);
    expect(
      within(items[1]).getByText("Preview", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      within(items[0]).queryByText("Preview", { selector: "span.rounded-sm" }),
    ).toBeNull();
  });

  it("shows an Optional badge for a non-required lesson", async () => {
    store[0] = { ...store[0], isRequired: false };
    renderTree();
    const item = await screen.findByTestId("lesson-item-a");
    expect(within(item).getByText("Optional")).toBeInTheDocument();
  });
});

describe("lesson creation", () => {
  async function openCreate(type: string) {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText("Lesson a");
    await user.click(screen.getByRole("button", { name: "+ Add Lesson" }));
    await user.click(screen.getByRole("menuitem", { name: type }));
    return user;
  }

  it("creates a TEXT lesson and re-renders without reload", async () => {
    const user = await openCreate("Text");
    await user.type(screen.getByLabelText("Tiêu đề bài học"), "Intro");
    await user.click(screen.getByLabelText(/Nội dung bài học/));
    await user.paste("<p>Hello</p>");
    await user.click(screen.getByRole("button", { name: "Tạo bài học" }));
    expect(await screen.findByText("Intro")).toBeInTheDocument();
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe("/chapters/ch1/lessons");
    expect(post.body).toMatchObject({
      title: "Intro",
      type: "TEXT",
      content: { textBody: "<p>Hello</p>" },
    });
    expect(post.body).toMatchObject({ isRequired: true });
  });

  it("creates a VIDEO lesson from a YouTube URL", async () => {
    const user = await openCreate("Video");
    await user.type(screen.getByLabelText("Tiêu đề bài học"), "Clip");
    await user.type(screen.getByLabelText("URL video"), "https://youtu.be/abc");
    await user.click(screen.getByRole("button", { name: "Tạo bài học" }));
    expect(await screen.findByText("Clip")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")!.body).toMatchObject({
      type: "VIDEO",
      content: { videoUrl: "https://youtu.be/abc" },
    });
  });

  it("rejects an unsupported video URL client-side", async () => {
    const user = await openCreate("Video");
    await user.type(screen.getByLabelText("Tiêu đề bài học"), "Clip");
    await user.type(
      screen.getByLabelText("URL video"),
      "http://evil.example/x",
    );
    await user.click(screen.getByRole("button", { name: "Tạo bài học" }));
    expect(await screen.findAllByText(/YouTube|Vimeo|https/i)).not.toHaveLength(
      0,
    );
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("creates a DOCUMENT lesson by multipart upload", async () => {
    const xhr = {
      open: vi.fn(),
      send: vi.fn(),
      upload: {} as { onprogress?: unknown },
      onload: null as null | (() => void),
      status: 201,
      responseText: "",
    };
    const created = lesson("n9", "DOCUMENT", 3, { title: "Slides" });
    xhr.responseText = JSON.stringify(created);
    xhr.send.mockImplementation(() => {
      store = [...store, created];
      xhr.onload?.();
    });
    vi.stubGlobal("XMLHttpRequest", function () {
      return xhr;
    });
    const user = await openCreate("Document");
    await user.type(screen.getByLabelText("Tiêu đề bài học"), "Slides");
    await user.upload(
      screen.getByLabelText(/Tệp đính kèm/),
      new File(["%PDF"], "slides.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByText(/slides\.pdf/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Cho phép học viên tải về"));
    await user.click(screen.getByRole("button", { name: "Tạo bài học" }));
    expect(await screen.findByText("Slides")).toBeInTheDocument();
    expect(xhr.open).toHaveBeenCalledWith(
      "POST",
      `${API}/chapters/ch1/lessons/document-upload`,
    );
    const form = xhr.send.mock.calls[0][0] as FormData;
    expect(form.get("allowDownload")).toBe("true");
    expect((form.get("file") as File).name).toBe("slides.pdf");
  });
});

describe("lesson toggles and deletion", () => {
  it("updates isRequired through the instructor edit API", async () => {
    const user = userEvent.setup();
    renderTree();
    const item = await screen.findByTestId("lesson-item-a");
    await user.click(within(item).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("switch", { name: /bài học bắt buộc/i }));
    fireEvent.submit(document.querySelector("#edit-lesson-form")!);
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/lessons/a",
        body: { isRequired: false },
      }),
    );
  });

  it("toggling isPreview sends PATCH /lessons/:id", async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText("Lesson a");
    await user.click(screen.getByRole("switch", { name: "Preview Lesson a" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/lessons/a",
        body: { isPreview: true },
      }),
    );
    expect(
      await screen.findAllByText("Preview", { selector: "span.rounded-sm" }),
    ).toHaveLength(2);
  });

  it("toggling isPublished sends PATCH", async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText("Lesson a");
    await user.click(screen.getByRole("switch", { name: "Xuất bản Lesson a" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/lessons/a",
        body: { isPublished: true },
      }),
    );
  });

  it("confirms before deleting", async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText("Lesson a");
    await user.click(screen.getByRole("button", { name: "Xóa Lesson a" }));
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(screen.queryByText("Lesson a")).toBeNull());
    expect(calls).toContainEqual({
      method: "DELETE",
      path: "/lessons/a",
      body: undefined,
    });
  });
});

describe("reordering", () => {
  it("computes the new order and payload", () => {
    const next = reorderAfterDrag(store, "a", "c")!;
    expect(next.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(toReorderPayload(next)).toEqual({
      lessonOrders: [
        { id: "b", position: 0 },
        { id: "c", position: 1 },
        { id: "a", position: 2 },
      ],
    });
    expect(reorderAfterDrag(store, "a", "a")).toBeNull();
    expect(reorderAfterDrag(store, "a", null)).toBeNull();
  });

  function useBoth() {
    return {
      list: useChapterLessons("ch1"),
      ...useLessonMutations("c1", "ch1"),
    };
  }

  it("optimistically reorders and PATCHes the reorder endpoint", async () => {
    const { result } = renderHook(useBoth, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.list.data).toHaveLength(3));
    await act(async () => {
      await result.current.reorder.mutateAsync(
        reorderAfterDrag(result.current.list.data!, "a", "c")!,
      );
    });
    const patch = calls.find(
      (call) => call.path === "/chapters/ch1/lessons/reorder",
    )!;
    expect(patch.method).toBe("PATCH");
    expect(patch.body).toEqual({
      lessonOrders: [
        { id: "b", position: 0 },
        { id: "c", position: 1 },
        { id: "a", position: 2 },
      ],
    });
    await waitFor(() =>
      expect(result.current.list.data!.map((item) => item.id)).toEqual([
        "b",
        "c",
        "a",
      ]),
    );
  });

  it("rolls back when the API fails", async () => {
    failReorder = true;
    const { result } = renderHook(useBoth, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.list.data).toHaveLength(3));
    await act(async () => {
      await result.current.reorder
        .mutateAsync(reorderAfterDrag(result.current.list.data!, "a", "c")!)
        .catch(() => undefined);
    });
    await waitFor(() =>
      expect(result.current.list.data!.map((item) => item.id)).toEqual([
        "a",
        "b",
        "c",
      ]),
    );
  });
});

describe("lessonFormSchema", () => {
  const base = {
    title: "T",
    isPreview: false,
    isRequired: true,
    textBody: "",
    source: "url" as const,
    videoUrl: "",
    file: null,
    allowDownload: false,
  };
  it("requires per-type content", () => {
    expect(lessonFormSchema("TEXT").safeParse(base).success).toBe(false);
    expect(
      lessonFormSchema("TEXT").safeParse({ ...base, textBody: "x" }).success,
    ).toBe(true);
    expect(lessonFormSchema("VIDEO").safeParse(base).success).toBe(false);
    expect(
      lessonFormSchema("VIDEO").safeParse({
        ...base,
        videoUrl: "https://vimeo.com/1",
      }).success,
    ).toBe(true);
    expect(lessonFormSchema("DOCUMENT").safeParse(base).success).toBe(false);
    expect(
      lessonFormSchema("DOCUMENT", { hasStoredFile: true }).safeParse(base)
        .success,
    ).toBe(true);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/providers/toast-provider";
import {
  chaptersKey,
  lessonsKey,
  useReorder,
  type Chapter,
  type Lesson,
} from "./data";

const API = "http://localhost:4000";
const course = "c1";
const chapter = (id: string, position: number): Chapter => ({
  id,
  title: id,
  position,
});
const lesson = (id: string, chapterId: string, position: number) =>
  ({ id, chapterId, title: id, position }) as Lesson;

let respond: () => Response;
let requests: Array<{ path: string; method: string; body: unknown }>;
beforeEach(() => {
  requests = [];
  respond = () => new Response(null, { status: 204 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({
        path: url.replace(API, ""),
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return respond();
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useReorder (chapters)", () => {
  const items = [chapter("a", 0), chapter("b", 1), chapter("c", 2)];
  const swapped = [items[1]!, items[0]!, items[2]!];

  it("shows the new order at once and sends positions to the API", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(chaptersKey(course), items);
    const { result } = renderHook(() => useReorder(course, "chapters"), {
      wrapper,
    });
    act(() => result.current.mutate({ items: swapped }));
    await waitFor(() =>
      expect(
        (client.getQueryData(chaptersKey(course)) as Chapter[]).map(
          (c) => c.id,
        ),
      ).toEqual(["b", "a", "c"]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests[0]).toEqual({
      path: `/courses/${course}/chapters/reorder`,
      method: "PATCH",
      body: {
        chapterOrders: [
          { id: "b", position: 0 },
          { id: "a", position: 1 },
          { id: "c", position: 2 },
        ],
      },
    });
  });

  it("puts the old order back and tells the instructor when saving fails", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(chaptersKey(course), items);
    respond = () =>
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
    const { result } = renderHook(() => useReorder(course, "chapters"), {
      wrapper,
    });
    act(() => result.current.mutate({ items: swapped }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      (client.getQueryData(chaptersKey(course)) as Chapter[]).map((c) => c.id),
    ).toEqual(["a", "b", "c"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không lưu được thứ tự chương, đã khôi phục thứ tự cũ.",
    );
  });
});

describe("useReorder (lessons)", () => {
  it("reorders one chapter's lessons and leaves other chapters alone", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(lessonsKey(course), [
      lesson("l1", "ch1", 0),
      lesson("l2", "ch1", 1),
      lesson("x1", "ch2", 0),
    ]);
    const { result } = renderHook(() => useReorder(course, "lessons"), {
      wrapper,
    });
    act(() =>
      result.current.mutate({
        chapterId: "ch1",
        items: [lesson("l2", "ch1", 0), lesson("l1", "ch1", 1)],
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests[0]).toMatchObject({
      path: `/courses/${course}/chapters/ch1/lessons/reorder`,
      body: { ids: ["l2", "l1"] },
    });
    const cached = client.getQueryData(lessonsKey(course)) as Lesson[];
    expect(cached.find((l) => l.id === "x1")?.chapterId).toBe("ch2");
  });

  it("says lessons, not chapters, when a lesson reorder fails", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(lessonsKey(course), [lesson("l1", "ch1", 0)]);
    respond = () => new Response("{}", { status: 500 });
    const { result } = renderHook(() => useReorder(course, "lessons"), {
      wrapper,
    });
    act(() =>
      result.current.mutate({
        chapterId: "ch1",
        items: [lesson("l1", "ch1", 0)],
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "thứ tự bài học",
    );
  });
});

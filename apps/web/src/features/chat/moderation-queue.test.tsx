import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/providers/toast-provider";
import type { ChatQueueItem } from "./api";
import { ModerationQueue } from "./ModerationQueue";
import { message } from "./test-server";

const item = (n: number, course = "c1"): ChatQueueItem => ({
  message: { ...message(n), status: "FLAGGED", content: `nội dung ${n}` },
  course: { id: course, title: `Khóa ${course}`, slug: `khoa-${course}` },
  reportCount: 2,
  lastReportedAt: "2026-10-10T08:00:00.000Z",
  reports: [
    {
      id: `r${n}`,
      reason: "Spam hoặc quảng cáo",
      reporter: { id: "s1", name: "Bình" },
      createdAt: "2026-10-10T08:00:00.000Z",
    },
  ],
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function setup(queue: ChatQueueItem[]) {
  const state = { queue: [...queue], calls: [] as string[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const path = new URL(input).pathname;
      state.calls.push(`${init.method ?? "GET"} ${path}`);
      if (path === "/api/v1/chat/moderation/queue") return json(state.queue);
      const dismissed = /\/chat\/messages\/(.+)\/dismiss$/.exec(path);
      if (dismissed) {
        state.queue = state.queue.filter((i) => i.message.id !== dismissed[1]);
        return json({ messageId: dismissed[1], status: "ACTIVE", dismissedReports: 2 });
      }
      return json({}, 404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<ModerationQueue />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
  return state;
}

describe("ModerationQueue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists reported messages with their reasons and course", async () => {
    setup([item(1), item(2, "c2")]);
    const cards = await screen.findAllByTestId("moderation-item");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("nội dung 1")).toBeInTheDocument();
    expect(within(cards[0]).getByText("2 báo cáo")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Spam hoặc quảng cáo")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("link", { name: "Khóa c1" })).toHaveAttribute(
      "href",
      "/learn/khoa-c1/chat",
    );
  });

  it("filters by course", async () => {
    setup([item(1), item(2, "c2")]);
    await screen.findAllByTestId("moderation-item");
    await userEvent.selectOptions(screen.getByLabelText("Khóa học"), "c2");
    const cards = screen.getAllByTestId("moderation-item");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("nội dung 2")).toBeInTheDocument();
  });

  it("dismisses unfounded reports and drops the card", async () => {
    const state = setup([item(1)]);
    const card = await screen.findByTestId("moderation-item");
    await userEvent.click(within(card).getByRole("button", { name: "Bỏ qua báo cáo" }));
    await waitFor(() =>
      expect(state.calls).toContain(
        `POST /api/v1/chat/messages/${message(1).id}/dismiss`,
      ),
    );
    expect(await screen.findByTestId("moderation-empty")).toBeInTheDocument();
  });

  it("opens the hide and mute dialogs on the right message and course", async () => {
    setup([item(1)]);
    const card = await screen.findByTestId("moderation-item");
    await userEvent.click(within(card).getByRole("button", { name: "Ẩn tin nhắn" }));
    expect(screen.getByRole("dialog", { name: "Ẩn tin nhắn" })).toHaveTextContent(
      "nội dung 1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    await userEvent.click(
      within(card).getByRole("button", { name: "Tạm khóa người gửi" }),
    );
    expect(
      screen.getByRole("dialog", { name: /Tạm khóa gửi tin: An/ }),
    ).toBeInTheDocument();
  });

  it("says so when there is nothing to review", async () => {
    setup([]);
    expect(await screen.findByTestId("moderation-empty")).toHaveTextContent(
      "Không có báo cáo nào cần xử lý",
    );
  });
});

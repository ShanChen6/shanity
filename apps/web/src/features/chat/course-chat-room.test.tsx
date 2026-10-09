import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/providers/toast-provider";
import { CourseChatRoom } from "./CourseChatRoom";
import { message } from "./test-server";
import type { ChatMessage } from "./types";

type Call = { method: string; path: string; body: unknown };

/** A minimal chat API behind fetch, recording what the room asked. */
function fakeApi({
  role = "student",
  messages = [] as ChatMessage[],
  send = (content: string): Response =>
    json({ ...message(99, 9999), content, sender: me }, 201),
}: {
  role?: "student" | "instructor";
  messages?: ChatMessage[];
  send?: (content: string) => Response;
} = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname, body });
      if (url.pathname.endsWith("/chat/me"))
        return json({ courseId: "c1", role, mutedUntil: null });
      if (url.pathname.endsWith("/chat/messages") && method === "GET")
        return json({ messages, hasMore: false });
      if (url.pathname.endsWith("/chat/messages")) return send(body.content);
      if (url.pathname.endsWith("/report"))
        return json({ reportId: "r1", messageId: "m", status: "PENDING" }, 201);
      return json({}, 404);
    }),
  );
  return calls;
}
const me = { id: "me", name: "Tôi", avatarUrl: null };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function renderRoom() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return render(
    <CourseChatRoom userId="me" courseId="c1" courseTitle="React căn bản" />,
    { wrapper },
  );
}

describe("CourseChatRoom", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the history and a red badge without a live connection", async () => {
    fakeApi({ messages: [message(1), message(2)] });
    renderRoom();
    expect(await screen.findAllByTestId("chat-message")).toHaveLength(2);
    expect(screen.getByTestId("chat-connection-status")).toHaveTextContent(
      "Mất kết nối",
    );
  });

  it("sends a message and shows it at once", async () => {
    const calls = fakeApi({ messages: [message(1)] });
    renderRoom();
    await screen.findByText("m1");
    await userEvent.type(screen.getByLabelText("Tin nhắn"), "Chào lớp{Enter}");
    expect(await screen.findByText("Chào lớp")).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: "POST",
      path: "/api/v1/courses/c1/chat/messages",
      body: { content: "Chào lớp" },
    });
  });

  it("explains the flood limit and keeps the draft", async () => {
    fakeApi({
      send: () =>
        json(
          { statusCode: 429, message: "CHAT_RATE_LIMITED", code: "CHAT_RATE_LIMITED" },
          429,
        ),
    });
    renderRoom();
    const input = await screen.findByLabelText("Tin nhắn");
    await userEvent.type(input, "lần sáu{Enter}");
    expect(await screen.findByText(/gửi tin quá nhanh/)).toBeInTheDocument();
    expect(input).toHaveValue("lần sáu");
  });

  it("switches to the muted notice when the server says so", async () => {
    fakeApi({
      send: () =>
        json(
          {
            statusCode: 403,
            message: "CHAT_MUTED",
            code: "CHAT_MUTED",
            mutedUntil: new Date(Date.now() + 60_000).toISOString(),
          },
          403,
        ),
    });
    renderRoom();
    await userEvent.type(await screen.findByLabelText("Tin nhắn"), "hi{Enter}");
    expect(await screen.findByTestId("chat-muted")).toBeInTheDocument();
  });

  it("lets a learner report someone else's message", async () => {
    const calls = fakeApi({ messages: [message(1)] });
    renderRoom();
    const item = (await screen.findAllByTestId("chat-message"))[0];
    await userEvent.click(
      within(item).getByRole("button", { name: /Thao tác với tin nhắn/ }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /Báo cáo/ }));
    const dialog = screen.getByRole("dialog", { name: "Báo cáo tin nhắn" });
    await userEvent.click(within(dialog).getByLabelText("Quấy rối hoặc bắt nạt"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi báo cáo" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "POST",
        path: `/api/v1/chat/messages/${message(1).id}/report`,
        body: { reason: "Quấy rối hoặc bắt nạt" },
      }),
    );
    expect(await screen.findByText(/Đã gửi báo cáo/)).toBeInTheDocument();
  });

  it("gives instructors moderation instead of reporting", async () => {
    fakeApi({ role: "instructor", messages: [message(1)] });
    renderRoom();
    const item = (await screen.findAllByTestId("chat-message"))[0];
    await screen.findByText(/Bạn là giảng viên/);
    await userEvent.click(
      within(item).getByRole("button", { name: /Thao tác với tin nhắn/ }),
    );
    expect(screen.getByRole("menuitem", { name: /Ẩn tin nhắn/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Tạm khóa người gửi/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Báo cáo/ })).toBeNull();
  });

  it("explains a refused room instead of the chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ statusCode: 403, message: "ENROLLMENT_REQUIRED", code: "ENROLLMENT_REQUIRED" }, 403),
      ),
    );
    renderRoom();
    expect(
      await screen.findByText("Bạn không có quyền vào phòng thảo luận này"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Tin nhắn")).toBeNull();
  });
});

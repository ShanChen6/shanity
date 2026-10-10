import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settle, visibleComments, withSending, type Thread } from "./comments-model";
import type { BlogComment, CommentPage } from "./types";

const session = vi.hoisted(() => ({
  value: {
    status: "authenticated" as string,
    user: { id: "me", displayName: "Tôi", avatarUrl: null } as null | {
      id: string;
      displayName: string;
      avatarUrl: null;
    },
  },
}));
vi.mock("@/features/auth/session-provider", () => ({ useSession: () => session.value }));

const { BlogCommentSection, PENDING_POLL_MS } = await import("./BlogCommentSection");

const comment = (id: string, extra: Partial<BlogComment> = {}): BlogComment => ({
  id,
  content: `nội dung ${id}`,
  status: "APPROVED",
  createdAt: "2026-10-10T08:00:00.000Z",
  author: { id: "u1", name: "Lan", avatarUrl: null },
  ...extra,
});
const page = (extra: Partial<CommentPage> = {}): CommentPage => ({
  comments: [],
  pending: [],
  page: 1,
  total: 0,
  totalPages: 0,
  ...extra,
});
const thread = (...pages: CommentPage[]): Thread => ({ pages, pageParams: pages.map((p) => p.page) });

describe("comments model", () => {
  const temp = comment("sending-1", { status: "SENDING", author: { id: "me", name: "Tôi", avatarUrl: null } });

  it("publishes an approved comment at the end of a fully loaded thread", () => {
    const start = withSending(thread(page({ comments: [comment("a")], total: 1, totalPages: 1 })), temp);
    const after = settle(start, temp.id, {
      comment: comment("b"),
      status: "APPROVED",
      reason: null,
      message: "",
    });
    expect(visibleComments(after)).toMatchObject({ mine: [], total: 2 });
    expect(visibleComments(after).published.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps a held comment with the author's own, and drops a rejected one", () => {
    const start = withSending(thread(page()), temp);
    const held = settle(start, temp.id, { comment: comment("p"), status: "PENDING", reason: "SUSPICIOUS", message: "" });
    expect(visibleComments(held).mine).toMatchObject([{ id: "p", status: "PENDING" }]);
    const rejected = settle(start, temp.id, { comment: comment("r"), status: "REJECTED", reason: "TOXIC", message: "" });
    expect(visibleComments(rejected)).toMatchObject({ published: [], mine: [] });
  });

  it("does not append to a thread whose last page is not loaded yet", () => {
    const start = thread(page({ comments: [comment("a")], total: 60, totalPages: 2 }));
    const after = settle(withSending(start, temp), temp.id, {
      comment: comment("z"),
      status: "APPROVED",
      reason: null,
      message: "",
    });
    expect(visibleComments(after).published.map((c) => c.id)).toEqual(["a"]);
    expect(visibleComments(after).total).toBe(61);
  });
});

describe("BlogCommentSection", () => {
  let server: { thread: CommentPage; outcome: () => Response; calls: string[] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  beforeEach(() => {
    session.value = { status: "authenticated", user: { id: "me", displayName: "Tôi", avatarUrl: null } };
    server = { thread: page(), outcome: () => json({}), calls: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => {
        server.calls.push(`${init.method ?? "GET"} ${new URL(input).pathname}`);
        return init.method === "POST" ? server.outcome() : json(server.thread);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function renderSection() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<BlogCommentSection slug="dao-ham" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
  }
  const box = () => screen.getByLabelText("Viết bình luận");

  it("AC1: a published comment shows as a normal comment", async () => {
    server.outcome = () =>
      json({
        comment: comment("c1", { content: "Bài viết rất hay!", author: { id: "me", name: "Tôi", avatarUrl: null } }),
        status: "APPROVED",
        reason: null,
        message: "Bình luận của bạn đã được đăng.",
      });
    renderSection();
    await screen.findByText(/Chưa có bình luận nào/);
    await userEvent.type(box(), "Bài viết rất hay!");
    await userEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
    const item = await screen.findByText("Bài viết rất hay!");
    expect(item.closest("li")).toHaveAttribute("data-status", "APPROVED");
    expect(screen.getByRole("status")).toHaveTextContent("đã được đăng");
    expect(server.calls).toContain("POST /api/v1/blog/posts/dao-ham/comments");
  });

  it("AC4: a held comment stays on its author's screen with the review badge", async () => {
    server.outcome = () =>
      json({
        comment: comment("p1", { content: "Chỗ này hơi ẩu", status: "PENDING", author: { id: "me", name: "Tôi", avatarUrl: null } }),
        status: "PENDING",
        reason: "SUSPICIOUS",
        message: "Bình luận của bạn đang chờ kiểm duyệt.",
      });
    renderSection();
    await screen.findByText(/Chưa có bình luận nào/);
    await userEvent.type(box(), "Chỗ này hơi ẩu");
    await userEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
    const item = (await screen.findByText("Chỗ này hơi ẩu")).closest("li")!;
    expect(item).toHaveAttribute("data-status", "PENDING");
    expect(within(item).getByText("Bình luận của bạn đang chờ kiểm duyệt")).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });

  it("turns public by itself once a moderator approves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mine = comment("p1", { content: "Đang chờ", status: "PENDING", author: { id: "me", name: "Tôi", avatarUrl: null } });
    server.thread = page({ pending: [mine] });
    renderSection();
    const item = (await screen.findByText("Đang chờ")).closest("li")!;
    expect(item).toHaveAttribute("data-status", "PENDING");

    server.thread = page({ comments: [{ ...mine, status: "APPROVED" }], total: 1, totalPages: 1 });
    await act(() => vi.advanceTimersByTimeAsync(PENDING_POLL_MS));
    await waitFor(() =>
      expect(screen.getByText("Đang chờ").closest("li")).toHaveAttribute("data-status", "APPROVED"),
    );
    expect(screen.queryByText("Bình luận của bạn đang chờ kiểm duyệt")).toBeNull();
  });

  it("explains a rejection and gives the text back to fix", async () => {
    server.outcome = () =>
      json({
        comment: comment("r1", { status: "REJECTED" }),
        status: "REJECTED",
        reason: "SPAM_LINK",
        message: "Bình luận vi phạm quy chuẩn nội dung nên không được đăng. Vui lòng không chèn liên kết ngoài.",
      });
    renderSection();
    await screen.findByText(/Chưa có bình luận nào/);
    await userEvent.type(box(), "xem tại spam.xyz");
    await userEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không chèn liên kết ngoài");
    expect(box()).toHaveValue("xem tại spam.xyz");
    expect(screen.queryAllByTestId("blog-comment")).toHaveLength(0);
  });

  it("asks guests to sign in and still shows the public thread", async () => {
    session.value = { status: "anonymous", user: null };
    server.thread = page({ comments: [comment("a", { content: "Công khai" })], total: 1, totalPages: 1 });
    renderSection();
    expect(await screen.findByText("Công khai")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fblog%2Fdao-ham",
    );
    expect(screen.queryByLabelText("Viết bình luận")).toBeNull();
  });
});

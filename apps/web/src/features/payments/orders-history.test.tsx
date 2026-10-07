import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { StudentOrder, StudentOrderPage } from "./types";

const router = { replace: vi.fn() };
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/account/orders",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({ user: { id: "u1" } }),
}));
const api = vi.hoisted(() => ({ fetchStudentOrders: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { OrdersHistory } from "./orders-history";

const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
const past = () => new Date(Date.now() - 10 * 60_000).toISOString();
const order = (
  code: string,
  overrides: Partial<StudentOrder> = {},
): StudentOrder => ({
  orderId: `id-${code}`,
  code,
  status: "PENDING",
  currency: "VND",
  subtotal: 499000,
  discountTotal: 0,
  finalTotal: 499000,
  paymentProvider: "VIETQR",
  expiresAt: future(),
  createdAt: "2026-10-07T03:00:00.000Z",
  items: [
    {
      id: `i-${code}`,
      courseId: "c1",
      courseTitleSnapshot: "Khóa học A",
      unitPriceSnapshot: 499000,
      discountSnapshot: 0,
      finalPriceSnapshot: 499000,
      currency: "VND",
      courseSlug: "khoa-hoc-a",
    },
  ],
  providerTransactionId: null,
  canResume: true,
  ...overrides,
});
const page = (
  data: StudentOrder[],
  extra: Partial<StudentOrderPage> = {},
): StudentOrderPage => ({
  data,
  total: data.length,
  page: 1,
  limit: 10,
  totalPages: 1,
  ...extra,
});

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OrdersHistory />
    </QueryClientProvider>,
  );
}
// React Query batches notifications with setTimeout; give it a few turns.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });

describe("OrdersHistory", () => {
  beforeEach(() => {
    search = "";
    router.replace.mockReset();
    api.fetchStudentOrders.mockReset();
  });

  it("lists code, date, courses, total, status, transaction code and actions", async () => {
    api.fetchStudentOrders.mockResolvedValue(
      page([
        order("SHAN-20261007-AAAA", {
          status: "COMPLETED",
          canResume: false,
          providerTransactionId: "FT26280123",
        }),
        order("SHAN-20261007-BBBB"),
        order("SHAN-20261007-CCCC", { status: "EXPIRED", canResume: false }),
        order("SHAN-20261007-DDDD", { canResume: true, expiresAt: past() }),
      ]),
    );
    renderHistory();
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeInTheDocument();
    await settle();

    const table = screen.getByRole("table", { name: "Lịch sử đơn hàng" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const done = within(rows[0]!);
    expect(done.getByText("SHAN-20261007-AAAA")).toBeInTheDocument();
    expect(done.getByText("Khóa học A")).toBeInTheDocument();
    expect(done.getByText("Hoàn tất")).toBeInTheDocument();
    expect(done.getByText("FT26280123")).toBeInTheDocument();
    expect(done.getByRole("link", { name: "Vào học" })).toHaveAttribute(
      "href",
      "/learn/khoa-hoc-a",
    );
    expect(done.getByRole("link", { name: "Chi tiết" })).toHaveAttribute(
      "href",
      "/checkout/SHAN-20261007-AAAA",
    );

    // pending + unexpired: continue paying
    const pending = within(rows[1]!);
    expect(pending.getByText("Đang chờ thanh toán")).toBeInTheDocument();
    expect(
      pending.getByRole("link", { name: "Thanh toán ngay" }),
    ).toHaveAttribute("href", "/checkout/SHAN-20261007-BBBB");
    // expired by status, or by the clock even though the server said resumable
    expect(
      within(rows[2]!).queryByRole("link", { name: "Thanh toán ngay" }),
    ).not.toBeInTheDocument();
    expect(
      within(rows[3]!).queryByRole("link", { name: "Thanh toán ngay" }),
    ).not.toBeInTheDocument();
    expect(within(rows[2]!).getByText("Hết hạn")).toBeInTheDocument();
  });

  it("asks the API for the tab in the URL and navigates on tab change", async () => {
    search = "status=pending&page=2";
    api.fetchStudentOrders.mockResolvedValue(
      page([order("SHAN-20261007-BBBB")], {
        page: 2,
        totalPages: 3,
        total: 21,
      }),
    );
    renderHistory();
    await settle();
    expect(api.fetchStudentOrders).toHaveBeenCalledWith(
      "pending",
      2,
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("tab", { name: "Đang chờ" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Tất cả",
      "Đang chờ",
      "Hoàn tất",
      "Đã hủy",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Hoàn tất" }));
    expect(router.replace).toHaveBeenLastCalledWith(
      "/account/orders?status=completed",
      { scroll: false },
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tất cả" }));
    expect(router.replace).toHaveBeenLastCalledWith("/account/orders", {
      scroll: false,
    });

    expect(screen.getByText(/Trang 2 \/ 3 · 21 đơn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(router.replace).toHaveBeenLastCalledWith(
      "/account/orders?status=pending&page=3",
      { scroll: false },
    );
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(router.replace).toHaveBeenLastCalledWith(
      "/account/orders?status=pending",
      { scroll: false },
    );
  });

  it("ignores junk query values", async () => {
    search = "status=hax&page=-4";
    api.fetchStudentOrders.mockResolvedValue(
      page([order("SHAN-20261007-BBBB")]),
    );
    renderHistory();
    await settle();
    expect(api.fetchStudentOrders).toHaveBeenCalledWith(
      "all",
      1,
      expect.any(AbortSignal),
    );
  });

  it("has a tailored empty state per tab", async () => {
    api.fetchStudentOrders.mockResolvedValue(page([]));
    const { unmount } = renderHistory();
    await settle();
    expect(screen.getByText("Bạn chưa có đơn hàng nào")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Khám phá khóa học" }),
    ).toHaveAttribute("href", "/courses");
    unmount();
    search = "status=cancelled";
    renderHistory();
    await settle();
    expect(
      screen.getByText("Không có đơn bị hủy hoặc hết hạn"),
    ).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    api.fetchStudentOrders.mockRejectedValueOnce(new ApiError(500, ["x"]));
    renderHistory();
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể tải đơn hàng",
    );
    api.fetchStudentOrders.mockResolvedValue(
      page([order("SHAN-20261007-BBBB")]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await settle();
    expect(screen.getAllByText("SHAN-20261007-BBBB").length).toBeGreaterThan(0);
  });

  it("renders mobile cards with the same data and actions", async () => {
    api.fetchStudentOrders.mockResolvedValue(
      page([
        order("SHAN-20261007-AAAA", {
          status: "COMPLETED",
          canResume: false,
          providerTransactionId: "FT1",
        }),
        order("SHAN-20261007-BBBB"),
      ]),
    );
    renderHistory();
    await settle();
    const cards = within(
      screen.getByRole("list", { name: "Lịch sử đơn hàng" }),
    ).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("FT1")).toBeInTheDocument();
    expect(
      within(cards[1]!).getByRole("link", { name: "Thanh toán ngay" }),
    ).toBeInTheDocument();
  });
});

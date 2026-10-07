import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminOrderList } from "./types";

const router = { replace: vi.fn() };
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin/orders",
  useSearchParams: () => new URLSearchParams(search),
}));
const api = vi.hoisted(() => ({
  fetchAdminOrders: vi.fn(),
  fetchAdminOrder: vi.fn(),
}));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { OrdersView } from "./orders-view";
import { detail, listItem, ORDER_CODE, ORDER_ID } from "./test-fixtures";

const page = (
  items = [
    listItem(),
    listItem({ id: "o2", code: "SHAN-20261007-ZZZZ", status: "COMPLETED" }),
  ],
  extra: Partial<AdminOrderList> = {},
): AdminOrderList => ({
  items,
  page: 1,
  limit: 20,
  total: items.length,
  totalPages: 1,
  ...extra,
});

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OrdersView />
    </QueryClientProvider>,
  );
}
const lastUrl = () => router.replace.mock.calls.at(-1)?.[0];

describe("OrdersView", () => {
  beforeEach(() => {
    search = "";
    router.replace.mockReset();
    api.fetchAdminOrders.mockReset();
    api.fetchAdminOrder.mockReset();
    api.fetchAdminOrders.mockResolvedValue(page());
  });

  it("shows a skeleton, then the orders", async () => {
    renderView();
    expect(screen.getByLabelText("Đang tải danh sách đơn hàng")).toBeVisible();
    expect(await screen.findByText(ORDER_CODE)).toBeInTheDocument();
    expect(screen.getByText("SHAN-20261007-ZZZZ")).toBeInTheDocument();
    expect(screen.getByText(/Hiển thị 1–2 trong 2 đơn hàng/)).toBeVisible();
  });

  it("asks the API for what the URL says", async () => {
    search =
      "q=react&status=COMPLETED&provider=MANUAL_RECONCILED&amountMin=1000&sortBy=finalTotal&sortOrder=asc&page=2&limit=10";
    renderView();
    await screen.findByText(ORDER_CODE);
    const params = new URLSearchParams(api.fetchAdminOrders.mock.calls[0][0]);
    expect(Object.fromEntries(params)).toEqual({
      q: "react",
      status: "COMPLETED",
      provider: "MANUAL_RECONCILED",
      amountMin: "1000",
      sortBy: "finalTotal",
      sortOrder: "asc",
      page: "2",
      limit: "10",
    });
    expect(screen.getByLabelText("Tìm kiếm")).toHaveValue("react");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("COMPLETED");
    expect(screen.getByLabelText("Nhà cung cấp")).toHaveValue(
      "MANUAL_RECONCILED",
    );
  });

  it("explains an empty list, with and without filters", async () => {
    api.fetchAdminOrders.mockResolvedValue(page([]));
    const { unmount } = renderView();
    expect(await screen.findByText("Chưa có đơn hàng nào")).toBeVisible();
    unmount();
    search = "q=khong-co";
    renderView();
    expect(
      await screen.findByText("Không tìm thấy đơn hàng phù hợp"),
    ).toBeVisible();
  });

  it("shows a Vietnamese error and retries", async () => {
    api.fetchAdminOrders.mockRejectedValueOnce(new ApiError(500, ["boom"]));
    renderView();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không thể tải danh sách đơn hàng");
    expect(alert).toHaveTextContent("Máy chủ đang gặp sự cố");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(ORDER_CODE)).toBeInTheDocument();
    expect(api.fetchAdminOrders).toHaveBeenCalledTimes(2);
  });

  it("changes the query when a sortable header is clicked", async () => {
    renderView();
    await screen.findByText(ORDER_CODE);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tổng thanh toán/ }));
    expect(lastUrl()).toBe("/admin/orders?sortBy=finalTotal");
    await user.click(screen.getByRole("button", { name: /Ngày tạo/ }));
    expect(lastUrl()).toBe("/admin/orders?sortOrder=asc");
    await user.click(screen.getByRole("button", { name: /Học viên/ }));
    expect(lastUrl()).toBe("/admin/orders?sortBy=studentName&sortOrder=asc");
  });

  it("flips the active column and resets to the first page", async () => {
    search = "sortBy=code&sortOrder=asc&page=3";
    renderView();
    await screen.findByText(ORDER_CODE);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Mã đơn/ }));
    expect(lastUrl()).toBe("/admin/orders?sortBy=code");
  });

  it("debounces the search box into a single URL update", async () => {
    renderView();
    await screen.findByText(ORDER_CODE);
    await userEvent.setup().type(screen.getByLabelText("Tìm kiếm"), "react");
    expect(router.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1), {
      timeout: 1500,
    });
    expect(lastUrl()).toBe("/admin/orders?q=react");
  });

  it("filters by status, provider, date field, dates and amounts", async () => {
    renderView();
    await screen.findByText(ORDER_CODE);
    const user = userEvent.setup();
    const statusSelect = screen.getByLabelText("Trạng thái");
    expect(
      within(statusSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Tất cả",
      "Đang chờ thanh toán",
      "Hoàn tất",
      "Đã hủy",
      "Hết hạn",
      "Đã hoàn tiền",
    ]);
    await user.selectOptions(statusSelect, "REFUNDED");
    expect(lastUrl()).toBe("/admin/orders?status=REFUNDED");
    await user.selectOptions(
      screen.getByLabelText("Nhà cung cấp"),
      "Đối soát thủ công",
    );
    expect(lastUrl()).toBe(
      "/admin/orders?status=REFUNDED&provider=MANUAL_RECONCILED",
    );
    await user.selectOptions(
      screen.getByLabelText("Lọc theo ngày"),
      "completedAt",
    );
    expect(lastUrl()).toContain("dateField=completedAt");
    await user.type(screen.getByLabelText("Từ ngày"), "2026-10-01");
    await waitFor(() => expect(lastUrl()).toContain("dateFrom=2026-10-01"));
    await user.type(screen.getByLabelText("Tổng tiền từ (₫)"), "5a00");
    await waitFor(() => expect(lastUrl()).toContain("amountMin=500"), {
      timeout: 1500,
    });
    expect(screen.getByLabelText("Tổng tiền từ (₫)")).toHaveValue("500");
  });

  it("clears the filters", async () => {
    search = "q=abc&status=COMPLETED&amountMax=9&sortBy=code&sortOrder=asc";
    renderView();
    await screen.findByText(ORDER_CODE);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(lastUrl()).toBe("/admin/orders?sortBy=code&sortOrder=asc");
  });

  it("does not call the API for an inverted range, and says why", async () => {
    search = "amountMin=900&amountMax=100";
    renderView();
    expect(
      await screen.findByText(/Số tiền tối thiểu phải nhỏ hơn hoặc bằng/),
    ).toBeVisible();
    expect(screen.getByText("Bộ lọc chưa hợp lệ")).toBeVisible();
    expect(api.fetchAdminOrders).not.toHaveBeenCalled();
  });

  it("pages and changes the page size", async () => {
    api.fetchAdminOrders.mockResolvedValue(
      page([listItem()], { total: 45, totalPages: 3 }),
    );
    renderView();
    await screen.findByText(ORDER_CODE);
    expect(screen.getByText("Trang 1 / 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(lastUrl()).toBe("/admin/orders?page=2");
    await user.selectOptions(screen.getByLabelText("Số dòng mỗi trang"), "50");
    expect(lastUrl()).toBe("/admin/orders?limit=50");
  });

  it("opens the detail drawer for the chosen order", async () => {
    api.fetchAdminOrder.mockResolvedValue(detail());
    renderView();
    await screen.findByText(ORDER_CODE);
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: `Xem chi tiết đơn ${ORDER_CODE}` }),
      );
    const drawer = await screen.findByRole("dialog", {
      name: `Đơn hàng ${ORDER_CODE}`,
    });
    expect(await within(drawer).findByText("Tóm tắt tài chính")).toBeVisible();
    expect(api.fetchAdminOrder).toHaveBeenCalledExactlyOnceWith(ORDER_ID);
  });
});

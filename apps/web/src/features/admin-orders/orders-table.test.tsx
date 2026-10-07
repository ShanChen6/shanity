import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OrdersTable } from "./orders-table";
import { listItem } from "./test-fixtures";
import type { AdminOrderListItem } from "./types";

const rows: AdminOrderListItem[] = [
  listItem({
    id: "o1",
    code: "SHAN-20261007-AAAA",
    courses: [
      { title: "React Nâng cao", finalPrice: 300000 },
      { title: "NestJS cơ bản", finalPrice: 100000 },
      { title: "SQL thực chiến", finalPrice: 99000 },
    ],
    finalTotal: 499000,
  }),
  listItem({
    id: "o2",
    code: "SHAN-20261007-BBBB",
    status: "COMPLETED",
    provider: "MANUAL_RECONCILED",
    paidAmount: 499000,
    refundedAmount: 100000,
    completedAt: "2026-10-07T04:00:00.000Z",
  }),
  listItem({
    id: "o3",
    code: "SHAN-20261007-CCCC",
    status: "REFUNDED",
    provider: "STRIPE",
    paidAmount: 499000,
    refundedAmount: 499000,
  }),
  listItem({ id: "o4", code: "SHAN-20261007-DDDD", status: "EXPIRED" }),
];

const renderTable = (
  props: Partial<Parameters<typeof OrdersTable>[0]> = {},
) => {
  const onSort = vi.fn();
  const onOpen = vi.fn();
  render(
    <OrdersTable
      items={rows}
      sortBy="createdAt"
      sortOrder="desc"
      onSort={onSort}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onSort, onOpen };
};
const rowOf = (code: string) =>
  screen.getByRole("row", { name: new RegExp(code) });

describe("OrdersTable", () => {
  it("lists the requested columns", () => {
    renderTable();
    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.replace(/[↑↓↕]/g, "").trim());
    expect(headers).toEqual([
      "Mã đơn",
      "Học viên",
      "Khóa học",
      "Tổng thanh toán",
      "Nhà cung cấp",
      "Trạng thái",
      "Ngày tạo",
      "Thao tác",
    ]);
  });

  it("renders student, first course with a count of the rest, total and provider", () => {
    renderTable();
    const first = within(rowOf("SHAN-20261007-AAAA"));
    expect(first.getByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(first.getByText("an.nguyen@example.test")).toBeInTheDocument();
    expect(first.getByText("React Nâng cao")).toBeInTheDocument();
    expect(first.getByText("+2 khóa khác")).toBeInTheDocument();
    expect(first.getByText("499.000 ₫")).toBeInTheDocument();
    expect(first.getByText("VietQR")).toBeInTheDocument();
    expect(first.getByText("Đang chờ thanh toán")).toBeInTheDocument();
    expect(
      within(rowOf("SHAN-20261007-DDDD")).queryByText(/khóa khác/),
    ).not.toBeInTheDocument();
  });

  it("colour-codes the status and labels it in Vietnamese", () => {
    renderTable();
    expect(
      within(rowOf("SHAN-20261007-BBBB")).getByText("Hoàn tất"),
    ).toHaveClass("bg-success-background");
    expect(
      within(rowOf("SHAN-20261007-CCCC")).getByText("Đã hoàn tiền"),
    ).toHaveClass("bg-info-background");
    expect(
      within(rowOf("SHAN-20261007-DDDD")).getByText("Hết hạn"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("SHAN-20261007-AAAA")).getByText("Đang chờ thanh toán"),
    ).toHaveClass("bg-warning-background");
  });

  it("highlights the manual reconciliation provider", () => {
    renderTable();
    expect(
      within(rowOf("SHAN-20261007-BBBB")).getByText("Đối soát thủ công"),
    ).toHaveClass("bg-warning-background");
  });

  it("hints at partial and full refunds, and only then", () => {
    renderTable();
    expect(
      within(rowOf("SHAN-20261007-BBBB")).getByText("Hoàn một phần 100.000 ₫"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("SHAN-20261007-CCCC")).getByText("Đã hoàn 499.000 ₫"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("SHAN-20261007-AAAA")).queryByText(/hoàn/i),
    ).not.toBeInTheDocument();
  });

  it("exposes the sort state with aria-sort", () => {
    renderTable({ sortBy: "finalTotal", sortOrder: "asc" });
    const header = (name: string) =>
      screen.getByRole("columnheader", { name: new RegExp(name) });
    expect(header("Tổng thanh toán")).toHaveAttribute("aria-sort", "ascending");
    expect(header("Ngày tạo")).toHaveAttribute("aria-sort", "none");
    expect(header("Mã đơn")).toHaveAttribute("aria-sort", "none");
    expect(header("Khóa học")).not.toHaveAttribute("aria-sort");
    expect(header("Thao tác")).not.toHaveAttribute("aria-sort");
  });

  it("reports the clicked sortable column", async () => {
    const { onSort } = renderTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tổng thanh toán/ }));
    await user.click(screen.getByRole("button", { name: /Học viên/ }));
    await user.click(screen.getByRole("button", { name: /Trạng thái/ }));
    await user.click(screen.getByRole("button", { name: /Mã đơn/ }));
    await user.click(screen.getByRole("button", { name: /Ngày tạo/ }));
    expect(onSort.mock.calls.map(([field]) => field)).toEqual([
      "finalTotal",
      "studentName",
      "status",
      "code",
      "createdAt",
    ]);
  });

  it("opens an order from its Chi tiết button and offers no other action", async () => {
    const { onOpen } = renderTable();
    const row = within(rowOf("SHAN-20261007-BBBB"));
    expect(row.getAllByRole("button")).toHaveLength(1);
    const open = row.getByRole("button", {
      name: "Xem chi tiết đơn SHAN-20261007-BBBB",
    });
    expect(open).toHaveTextContent("Chi tiết");
    await userEvent.setup().click(open);
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
  });
});

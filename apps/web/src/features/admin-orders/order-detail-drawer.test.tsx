import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL, ApiError } from "@/lib/api";
import type { AdminOrderDetail } from "./types";

const api = vi.hoisted(() => ({
  fetchAdminOrder: vi.fn(),
  reconcileOrder: vi.fn(),
  refundOrder: vi.fn(),
  uploadProof: vi.fn(),
}));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { OrderDetailDrawer } from "./order-detail-drawer";
import { completedDetail, detail, ORDER_CODE, ORDER_ID } from "./test-fixtures";

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <OrderDetailDrawer
        orderId={ORDER_ID}
        code={ORDER_CODE}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { ...view, invalidate, onClose };
}
const open = async (order: AdminOrderDetail = detail()) => {
  api.fetchAdminOrder.mockResolvedValue(order);
  const view = renderDrawer();
  await screen.findByRole("region", { name: "Tóm tắt tài chính" });
  return view;
};
const section = (name: string) => screen.getByRole("region", { name });

describe("OrderDetailDrawer", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it("shows the audit notice while loading, then every section", async () => {
    api.fetchAdminOrder.mockResolvedValue(detail());
    renderDrawer();
    const drawer = screen.getByRole("dialog", {
      name: `Đơn hàng ${ORDER_CODE}`,
    });
    expect(drawer).toHaveTextContent(
      "Việc mở màn hình này được ghi vào nhật ký kiểm toán.",
    );
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeVisible();
    await screen.findByRole("region", { name: "Tóm tắt tài chính" });
    for (const name of [
      "Học viên",
      "Khóa học",
      "Tóm tắt tài chính",
      "Giao dịch",
      "Dòng thời gian",
      "Nhật ký kiểm toán",
    ])
      expect(section(name)).toBeVisible();
  });

  it("shows the student, frozen course snapshot and financial summary", async () => {
    await open(completedDetail());
    const student = within(section("Học viên"));
    expect(student.getByText("Nguyễn Văn An")).toBeVisible();
    expect(student.getByText("an.nguyen@example.test")).toBeVisible();
    const items = within(section("Khóa học"));
    expect(items.getByText("React Nâng cao")).toBeVisible();
    expect(items.getByText("599.000 ₫")).toBeVisible();
    expect(items.getByText("Thành tiền")).toBeVisible();
    expect(items.getByText("Chưa cấp quyền")).toBeVisible();
    const summary = within(section("Tóm tắt tài chính"));
    expect(summary.getByText("Tạm tính").nextSibling).toHaveTextContent(
      "599.000 ₫",
    );
    expect(summary.getByText("Đã thanh toán").nextSibling).toHaveTextContent(
      "499.000 ₫",
    );
    expect(summary.getByText("Có thể hoàn").nextSibling).toHaveTextContent(
      "499.000 ₫",
    );
    expect(summary.getByText("Tiền tệ").nextSibling).toHaveTextContent("VND");
    expect(summary.getByText("Chưa hoàn tiền")).toBeVisible();
  });

  it("renders ledger payloads as escaped text, never as HTML", async () => {
    await open();
    const ledger = within(section("Giao dịch"));
    expect(ledger.getByText("VQR-0001")).toBeVisible();
    expect(ledger.getByText("Đã khởi tạo")).toBeVisible();
    const payload = ledger.getByLabelText("Dữ liệu gốc (raw payload)");
    expect(payload).toHaveTextContent('"note": "<script>alert(1)</script>"');
    expect(document.querySelector("dialog script")).toBeNull();
    expect(payload.closest("details")).not.toHaveAttribute("open");
  });

  it("lists the timeline in Vietnamese with the reconciliation details", async () => {
    await open();
    const timeline = within(section("Dòng thời gian"));
    const titles = timeline
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    expect(titles).toEqual([
      "Đơn hàng được tạo",
      "Khởi tạo thanh toán",
      "Đối soát thủ công",
    ]);
    const reconciled = within(timeline.getAllByRole("listitem")[2]);
    expect(reconciled.getByText("finance@example.test")).toBeVisible();
    expect(
      reconciled.getByText(
        "Khách chuyển khoản đúng nội dung nhưng webhook bị mất",
      ),
    ).toBeVisible();
    expect(reconciled.getByText("FT26280123")).toBeVisible();
    const proof = reconciled.getByRole("link", { name: /Xem chứng từ/ });
    expect(proof).toHaveAttribute(
      "href",
      `${API_URL}/api/v1/admin/orders/${ORDER_ID}/proofs/aaaa.png`,
    );
    expect(proof).toHaveAttribute("target", "_blank");
    expect(proof).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(timeline.getAllByText(/\d{2}:\d{2}:\d{2}/)).toHaveLength(3);
  });

  it("lists the audit trail newest first and expands before/after state", async () => {
    await open();
    const audit = within(section("Nhật ký kiểm toán"));
    expect(
      audit.getByText("Nhật ký chỉ ghi thêm, không thể sửa hoặc xóa."),
    ).toBeVisible();
    const [newest, oldest] = audit.getAllByRole("listitem");
    expect(within(newest).getByText("Xem chi tiết đơn hàng")).toBeVisible();
    expect(within(newest).getByText("admin@example.test")).toBeVisible();
    expect(within(newest).getByText("203.0.113.7")).toBeVisible();
    expect(within(newest).getByText(/Admin opened the order/)).toBeVisible();
    expect(within(oldest).getByText("SYSTEM")).toBeVisible();
    expect(within(oldest).getByText("Thay đổi trạng thái")).toBeVisible();
    expect(
      within(oldest).getByText(/Order expired without payment/),
    ).toBeVisible();
    expect(within(oldest).getByLabelText("Trạng thái trước")).toHaveTextContent(
      '"status": "PENDING"',
    );
    expect(within(oldest).getByLabelText("Trạng thái sau")).toHaveTextContent(
      '"status": "EXPIRED"',
    );
    expect(audit.queryByRole("button", { name: /xóa|sửa/i })).toBeNull();
  });

  it("offers only the actions the order allows", async () => {
    const { unmount } = await open(detail());
    expect(
      screen.getByRole("button", { name: "Đối soát thủ công" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Hoàn tiền" })).toBeNull();
    unmount();
    const refundable = await open(completedDetail());
    expect(screen.getByRole("button", { name: "Hoàn tiền" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Đối soát thủ công" }),
    ).toBeNull();
    refundable.unmount();
    await open(detail({ actions: { canReconcile: false, canRefund: false } }));
    expect(
      screen.queryByRole("button", { name: "Đối soát thủ công" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Hoàn tiền" })).toBeNull();
    expect(screen.getByText(/không có thao tác khả dụng/)).toBeVisible();
  });

  it("has no status control of any kind", async () => {
    await open();
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(drawer).queryAllByRole("switch")).toHaveLength(0);
    expect(
      within(drawer).queryByRole("button", {
        name: /đánh dấu|đổi trạng thái|đã thanh toán/i,
      }),
    ).toBeNull();
  });

  it("reads the order once: no refetch on focus, reconnect or visibility", async () => {
    await open();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(api.fetchAdminOrder).toHaveBeenCalledTimes(1);
  });

  it("explains a failed load and retries on request", async () => {
    api.fetchAdminOrder.mockRejectedValueOnce(
      new ApiError(404, ["ORDER_NOT_FOUND"]),
    );
    api.fetchAdminOrder.mockResolvedValueOnce(detail());
    renderDrawer();
    expect(await screen.findByText("Không tìm thấy đơn hàng.")).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Thử lại" }));
    expect(
      await screen.findByRole("region", { name: "Dòng thời gian" }),
    ).toBeVisible();
    expect(api.fetchAdminOrder).toHaveBeenCalledTimes(2);
  });

  it("closes from its button", async () => {
    const { onClose } = await open();
    await userEvent.setup().click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "Đóng",
      })[0],
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("applies a reconciliation from the response, without refetching", async () => {
    const reconciled = completedDetail({
      timeline: detail().timeline,
      items: detail().items.map((item) => ({
        ...item,
        enrollment: "ACTIVE" as const,
      })),
    });
    api.uploadProof.mockResolvedValue({
      proofKey: "k.png",
      proofImageUrl: `/api/v1/admin/orders/${ORDER_ID}/proofs/k.png`,
      contentType: "image/png",
      size: 3,
    });
    api.reconcileOrder.mockResolvedValue({
      order: reconciled,
      enrollmentGranted: true,
    });
    const { invalidate } = await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Đối soát thủ công" }));
    const modal = await screen.findByRole("dialog", {
      name: `Đối soát thủ công đơn ${ORDER_CODE}`,
    });
    await user.type(
      within(modal).getByLabelText("Mã giao dịch ngân hàng"),
      "FT26280123",
    );
    await user.type(
      within(modal).getByLabelText(/Lý do \/ ghi chú đối soát/),
      "Khách chuyển khoản đúng nội dung",
    );
    await user.upload(
      within(modal).getByLabelText(/Chứng từ chuyển khoản/),
      new File(["png"], "sao-ke.png", { type: "image/png" }),
    );
    await within(modal).findByText(/Đã tải lên/);
    await user.click(within(modal).getByLabelText(/đã kiểm tra sao kê/));
    await user.click(
      within(modal).getByRole("button", { name: "Xác nhận đối soát" }),
    );
    expect(await within(modal).findByText("Đối soát thành công")).toBeVisible();
    await user.click(within(modal).getByRole("button", { name: "Đóng" }));

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("Hoàn tất")).toBeVisible();
    expect(within(drawer).getByText(/Đã đối soát đơn/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Đối soát thủ công" }),
    ).toBeNull();
    expect(api.fetchAdminOrder).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["admin-orders", "list"],
    });
  });

  it("applies a refund from the response and shows how it was paid out", async () => {
    const refunded = completedDetail({
      status: "REFUNDED",
      summary: {
        ...completedDetail().summary,
        refundedAmount: 499000,
        refundableAmount: 0,
        refundStatus: "REFUNDED",
      },
      actions: { canReconcile: false, canRefund: false },
    });
    api.refundOrder.mockResolvedValue({
      order: refunded,
      refund: {
        amount: 499000,
        status: "REFUNDED",
        mode: "INTERNAL",
        providerTransactionId: "INTERNAL-REFUND-1",
        enrollmentsRevoked: 1,
      },
    });
    await open(completedDetail());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hoàn tiền" }));
    const modal = await screen.findByRole("dialog", {
      name: `Hoàn tiền đơn ${ORDER_CODE}`,
    });
    await user.type(
      within(modal).getByLabelText(/Lý do hoàn tiền/),
      "Học viên yêu cầu hoàn tiền",
    );
    await user.click(within(modal).getByLabelText(/Tôi xác nhận số tiền/));
    await user.click(
      within(modal).getByRole("button", { name: "Xác nhận hoàn tiền" }),
    );
    expect(
      await within(modal).findByText(
        "Ghi nhận hoàn tiền nội bộ — cần chuyển khoản thủ công",
      ),
    ).toBeVisible();
    expect(within(modal).getByText(/Đã hoàn toàn bộ/)).toBeVisible();
    await user.click(within(modal).getByRole("button", { name: "Đóng" }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getAllByText("Đã hoàn tiền").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: "Hoàn tiền" })).toBeNull();
    expect(api.fetchAdminOrder).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminOrderDetail, RefundResult } from "./types";

const api = vi.hoisted(() => ({ refundOrder: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { RefundModal } from "./refund-modal";
import { completedDetail, ORDER_ID } from "./test-fixtures";

const result = (
  refund: Partial<RefundResult["refund"]> = {},
): RefundResult => ({
  order: completedDetail(),
  refund: {
    amount: 499000,
    status: "REFUNDED",
    mode: "PROVIDER_API",
    providerTransactionId: "re_123",
    enrollmentsRevoked: 1,
    ...refund,
  },
});

function renderModal(order: AdminOrderDetail = completedDetail()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RefundModal order={order} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return {
    onClose,
    onDone,
    user: userEvent.setup(),
    submit: () => screen.getByRole("button", { name: "Xác nhận hoàn tiền" }),
    amount: () => screen.getByLabelText(/Số tiền hoàn/),
    reason: () => screen.getByLabelText(/Lý do hoàn tiền/),
    notify: () => screen.getByLabelText(/Thông báo hoàn tiền cho học viên/),
    confirm: () => screen.getByLabelText(/Tôi xác nhận số tiền/),
  };
}

describe("RefundModal", () => {
  beforeEach(() => {
    api.refundOrder.mockReset();
    api.refundOrder.mockResolvedValue(result());
  });

  it("warns that a full refund revokes access", () => {
    renderModal();
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("thu hồi quyền truy cập khóa học");
    expect(warning).toHaveTextContent("nhật ký kiểm toán");
  });

  it("starts at the refundable amount and stays locked until justified and confirmed", async () => {
    const ui = renderModal();
    expect(ui.amount()).toHaveValue("499000");
    expect(ui.notify()).toBeChecked();
    expect(ui.submit()).toBeDisabled();
    await ui.user.type(ui.reason(), "Học viên yêu cầu hoàn tiền");
    expect(ui.submit()).toBeDisabled();
    await ui.user.click(ui.confirm());
    expect(ui.submit()).toBeEnabled();
  });

  it("keeps the amount between 1 and the refundable amount", async () => {
    const ui = renderModal();
    await ui.user.type(ui.reason(), "Học viên yêu cầu hoàn tiền");
    await ui.user.click(ui.confirm());
    for (const [typed, ok] of [
      ["0", false],
      ["1", true],
      ["250000", true],
      ["499000", true],
      ["499001", false],
      ["9999999999", false],
    ] as const) {
      await ui.user.clear(ui.amount());
      await ui.user.type(ui.amount(), typed);
      expect(ui.submit().hasAttribute("disabled"), typed).toBe(!ok);
    }
    await ui.user.clear(ui.amount());
    expect(
      screen.getByText("Nhập số tiền hoàn là số nguyên dương."),
    ).toBeVisible();
    expect(ui.submit()).toBeDisabled();
    await ui.user.type(ui.amount(), "499001");
    expect(screen.getByText("Số tiền hoàn tối đa là 499.000 ₫.")).toBeVisible();
  });

  it("fills the whole refundable amount on request", async () => {
    const ui = renderModal(
      completedDetail({
        summary: {
          ...completedDetail().summary,
          refundedAmount: 100000,
          refundableAmount: 399000,
        },
      }),
    );
    expect(ui.amount()).toHaveValue("399000");
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "5000");
    await ui.user.click(screen.getByRole("button", { name: "Hoàn toàn bộ" }));
    expect(ui.amount()).toHaveValue("399000");
    expect(screen.getByText(/quyền học sẽ bị thu hồi/)).toBeVisible();
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "5000");
    expect(screen.queryByText(/quyền học sẽ bị thu hồi/)).toBeNull();
  });

  it("requires a justification of at least 10 characters", async () => {
    const ui = renderModal();
    await ui.user.click(ui.confirm());
    await ui.user.type(ui.reason(), "lý do");
    expect(
      screen.getByText(/Lý do cần ít nhất 10 ký tự \(hiện có 5\)/),
    ).toBeVisible();
    expect(ui.submit()).toBeDisabled();
  });

  it("sends the amount, reason and notification choice", async () => {
    api.refundOrder.mockResolvedValue(
      result({
        amount: 250000,
        status: "PARTIALLY_REFUNDED",
        enrollmentsRevoked: 0,
      }),
    );
    const ui = renderModal();
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "250000");
    await ui.user.type(ui.reason(), "  Hoàn một phần theo chính sách  ");
    await ui.user.click(ui.notify());
    await ui.user.click(ui.confirm());
    await ui.user.click(ui.submit());
    expect(api.refundOrder).toHaveBeenCalledExactlyOnceWith(ORDER_ID, {
      refundAmount: 250000,
      reason: "Hoàn một phần theo chính sách",
      notifyStudent: false,
    });
    expect(await screen.findByText("Đã ghi nhận hoàn tiền")).toBeVisible();
    expect(
      screen.getByText(/Hoàn một phần, đơn hàng vẫn Hoàn tất/),
    ).toBeVisible();
    expect(screen.getByText("Đã hoàn qua cổng thanh toán")).toBeVisible();
    expect(screen.queryByText(/Đã thu hồi quyền học/)).toBeNull();
    expect(ui.onDone).toHaveBeenCalledWith(
      expect.stringContaining("hoàn một phần"),
    );
  });

  it("explains a full internal refund: revoked access and a manual payout", async () => {
    api.refundOrder.mockResolvedValue(
      result({ mode: "INTERNAL", enrollmentsRevoked: 2 }),
    );
    const ui = renderModal();
    await ui.user.type(ui.reason(), "Học viên yêu cầu hoàn tiền");
    await ui.user.click(ui.confirm());
    await ui.user.click(ui.submit());
    expect(
      await screen.findByText(
        "Ghi nhận hoàn tiền nội bộ — cần chuyển khoản thủ công",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/Đã hoàn toàn bộ, đơn hàng chuyển sang Đã hoàn tiền/),
    ).toBeVisible();
    expect(
      screen.getByText("Đã thu hồi quyền học của 2 khóa học."),
    ).toBeVisible();
    await ui.user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(ui.onClose).toHaveBeenCalled();
  });

  it.each([
    ["REFUND_EXCEEDS_REFUNDABLE", 400, /vượt quá số tiền còn có thể hoàn/],
    ["ORDER_NOT_REFUNDABLE", 409, /không thể hoàn tiền/],
    ["PAYMENT_PROVIDER_REQUEST_FAILED", 502, /Chưa có khoản nào được ghi nhận/],
  ])(
    "shows %s in Vietnamese and keeps the form",
    async (code, status, text) => {
      api.refundOrder.mockRejectedValue(new ApiError(status, [code]));
      const ui = renderModal();
      await ui.user.type(ui.reason(), "Học viên yêu cầu hoàn tiền");
      await ui.user.click(ui.confirm());
      await ui.user.click(ui.submit());
      const alerts = await screen.findAllByRole("alert");
      expect(alerts.at(-1)).toHaveTextContent(text);
      expect(alerts.at(-1)).not.toHaveTextContent(code);
      expect(ui.reason()).toHaveValue("Học viên yêu cầu hoàn tiền");
      expect(ui.submit()).toBeEnabled();
      expect(ui.onDone).not.toHaveBeenCalled();
    },
  );
});

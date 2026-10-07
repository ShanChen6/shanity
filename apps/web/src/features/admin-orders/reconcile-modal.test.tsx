import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminOrderDetail } from "./types";

const api = vi.hoisted(() => ({
  reconcileOrder: vi.fn(),
  uploadProof: vi.fn(),
}));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { ReconcileModal } from "./reconcile-modal";
import { completedDetail, detail, ORDER_ID } from "./test-fixtures";

const PROOF_URL = `/api/v1/admin/orders/${ORDER_ID}/proofs/uploaded.png`;
const png = () => new File(["png"], "sao-ke.png", { type: "image/png" });

function renderModal(order: AdminOrderDetail = detail()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ReconcileModal order={order} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  const get = (label: string | RegExp) => screen.getByLabelText(label);
  return {
    onClose,
    onDone,
    user: userEvent.setup(),
    submit: () => screen.getByRole("button", { name: "Xác nhận đối soát" }),
    txn: () => get("Mã giao dịch ngân hàng"),
    amount: () => get(/Số tiền đã nhận/),
    note: () => get(/Lý do \/ ghi chú đối soát/),
    proof: () => get(/Chứng từ chuyển khoản/),
    confirm: () => get(/đã kiểm tra sao kê ngân hàng/),
  };
}

async function fillValid(ui: ReturnType<typeof renderModal>) {
  await ui.user.type(ui.txn(), "FT26280123");
  await ui.user.type(ui.note(), "Khách chuyển khoản đúng nội dung");
  await ui.user.upload(ui.proof(), png());
  await screen.findByText(/Đã tải lên/);
  await ui.user.click(ui.confirm());
}

describe("ReconcileModal", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.uploadProof.mockResolvedValue({
      proofKey: "uploaded.png",
      proofImageUrl: PROOF_URL,
      contentType: "image/png",
      size: 3,
    });
    api.reconcileOrder.mockResolvedValue({
      order: completedDetail(),
      enrollmentGranted: true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("warns that the action is irreversible and permanently audited", () => {
    renderModal();
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("Thao tác không thể hoàn tác");
    expect(warning).toHaveTextContent("cấp khóa học");
    expect(warning).toHaveTextContent("hoàn tiền");
    expect(warning).toHaveTextContent("danh tính và địa chỉ IP");
  });

  it("starts from the order's total and provider, with the submit locked", () => {
    const ui = renderModal();
    expect(ui.amount()).toHaveValue("499000");
    expect(screen.getByLabelText("Kênh học viên đã thanh toán")).toHaveValue(
      "VIETQR",
    );
    expect(ui.confirm()).not.toBeChecked();
    expect(ui.submit()).toBeDisabled();
  });

  it("defaults the channel to the order's own, or VietQR for a ledger-only one", () => {
    renderModal(detail({ provider: "MOMO" }));
    expect(screen.getByLabelText("Kênh học viên đã thanh toán")).toHaveValue(
      "MOMO",
    );
  });

  it("never offers the ledger-only provider as a channel", () => {
    renderModal(detail({ provider: "MANUAL_RECONCILED" }));
    const channel = screen.getByLabelText("Kênh học viên đã thanh toán");
    expect(channel).toHaveValue("VIETQR");
    expect(
      within(channel)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["VietQR", "Stripe", "MoMo", "VNPay", "Chuyển khoản thủ công"]);
  });

  it("validates the bank reference", async () => {
    const ui = renderModal();
    await ui.user.type(ui.txn(), "ab");
    expect(screen.getByText(/Mã giao dịch gồm 4–100 ký tự/)).toBeVisible();
    await ui.user.clear(ui.txn());
    await ui.user.type(ui.txn(), "bad ref!");
    expect(screen.getByText(/Mã giao dịch gồm 4–100 ký tự/)).toBeVisible();
    await ui.user.clear(ui.txn());
    await ui.user.type(ui.txn(), "FT26280123/A-1");
    expect(screen.queryByText(/Mã giao dịch gồm 4–100 ký tự/)).toBeNull();
  });

  it("requires an amount of at least the order total", async () => {
    const ui = renderModal();
    await fillValid(ui);
    expect(ui.submit()).toBeEnabled();
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "498999");
    expect(
      screen.getByText(/Số tiền nhận phải từ 499.000 ₫ trở lên/),
    ).toBeVisible();
    expect(ui.submit()).toBeDisabled();
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "1x5.0e5");
    expect(ui.amount()).toHaveValue("1505");
    await ui.user.clear(ui.amount());
    await ui.user.type(ui.amount(), "600000");
    expect(ui.submit()).toBeEnabled();
  });

  it("requires a justification of at least 10 characters", async () => {
    const ui = renderModal();
    await fillValid(ui);
    await ui.user.clear(ui.note());
    await ui.user.type(ui.note(), "ngắn");
    expect(
      screen.getByText(/cần ít nhất 10 ký tự \(hiện có 4\)/),
    ).toBeVisible();
    expect(ui.submit()).toBeDisabled();
    await ui.user.clear(ui.note());
    await ui.user.type(ui.note(), "          ngắn          ");
    expect(ui.submit()).toBeDisabled();
    await ui.user.clear(ui.note());
    await ui.user.type(ui.note(), "đủ mười ký tự");
    expect(ui.submit()).toBeEnabled();
  });

  it("stays locked until the proof is uploaded and the checkbox is ticked", async () => {
    const ui = renderModal();
    await ui.user.type(ui.txn(), "FT26280123");
    await ui.user.type(ui.note(), "Khách chuyển khoản đúng nội dung");
    await ui.user.click(ui.confirm());
    expect(ui.submit()).toBeDisabled();
    await ui.user.upload(ui.proof(), png());
    await screen.findByText(/Đã tải lên/);
    expect(screen.getByText("sao-ke.png")).toBeVisible();
    expect(ui.submit()).toBeEnabled();
    await ui.user.click(ui.confirm());
    expect(ui.submit()).toBeDisabled();
    await ui.user.click(ui.confirm());
    await ui.user.click(screen.getByRole("button", { name: "Gỡ" }));
    expect(ui.submit()).toBeDisabled();
  });

  it("uploads the proof first, then submits its returned URL", async () => {
    const ui = renderModal();
    await fillValid(ui);
    expect(api.uploadProof).toHaveBeenCalledTimes(1);
    expect(api.uploadProof.mock.calls[0][0]).toBe(ORDER_ID);
    expect(api.uploadProof.mock.calls[0][1]).toBeInstanceOf(File);
    expect(api.reconcileOrder).not.toHaveBeenCalled();
    await ui.user.selectOptions(
      screen.getByLabelText("Kênh học viên đã thanh toán"),
      "VNPAY",
    );
    await ui.user.click(ui.submit());
    await screen.findByText("Đối soát thành công");
    expect(api.reconcileOrder).toHaveBeenCalledExactlyOnceWith(ORDER_ID, {
      providerTransactionId: "FT26280123",
      amountReceived: 499000,
      provider: "VNPAY",
      note: "Khách chuyển khoản đúng nội dung",
      proofImageUrl: PROOF_URL,
    });
    expect(api.uploadProof.mock.invocationCallOrder[0]).toBeLessThan(
      api.reconcileOrder.mock.invocationCallOrder[0],
    );
    expect(ui.onDone).toHaveBeenCalledWith(
      expect.stringContaining("cấp quyền học"),
    );
  });

  it("locks the form while submitting", async () => {
    let finish!: (value: unknown) => void;
    api.reconcileOrder.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const ui = renderModal();
    await fillValid(ui);
    await ui.user.click(ui.submit());
    expect(
      screen.getByRole("button", { name: /Đang đối soát/ }),
    ).toBeDisabled();
    expect(ui.txn()).toBeDisabled();
    expect(ui.note()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();
    finish({ order: completedDetail(), enrollmentGranted: false });
    expect(
      await screen.findByText("Chưa cấp được quyền học ngay"),
    ).toBeVisible();
  });

  it("shows the server's reason in Vietnamese and keeps what was typed", async () => {
    api.reconcileOrder.mockRejectedValue(
      new ApiError(409, ["PROVIDER_TRANSACTION_ALREADY_RECORDED"]),
    );
    const ui = renderModal();
    await fillValid(ui);
    await ui.user.click(ui.submit());
    const alert = await screen.findByText(
      "Mã giao dịch này đã được ghi nhận cho một khoản thanh toán khác.",
    );
    expect(alert).toBeVisible();
    expect(
      screen.queryByText(/PROVIDER_TRANSACTION_ALREADY_RECORDED/),
    ).toBeNull();
    expect(ui.txn()).toHaveValue("FT26280123");
    expect(ui.submit()).toBeEnabled();
    expect(ui.onDone).not.toHaveBeenCalled();
  });

  it("rejects unsupported and oversized proofs before uploading", async () => {
    const ui = renderModal();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      ui.proof(),
      new File(["x"], "ghi-chu.txt", { type: "text/plain" }),
    );
    expect(
      screen.getByText("Chứng từ phải là ảnh PNG, JPG, WebP hoặc tệp PDF."),
    ).toBeVisible();
    const big = new File(["x"], "lon.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    await user.upload(ui.proof(), big);
    expect(
      screen.getByText("Chứng từ quá lớn. Vui lòng chọn tệp tối đa 5 MB."),
    ).toBeVisible();
    expect(api.uploadProof).not.toHaveBeenCalled();
  });

  it("reports a failed upload and lets the user try again", async () => {
    api.uploadProof.mockRejectedValueOnce(
      new ApiError(400, ["PROOF_TYPE_NOT_SUPPORTED"]),
    );
    const ui = renderModal();
    await ui.user.upload(ui.proof(), png());
    expect(
      await screen.findByText(
        "Chứng từ phải là ảnh PNG, JPG, WebP hoặc tệp PDF.",
      ),
    ).toBeVisible();
    await ui.user.upload(ui.proof(), png());
    expect(await screen.findByText(/Đã tải lên/)).toBeVisible();
    expect(screen.queryByText(/Chứng từ phải là ảnh/)).toBeNull();
  });

  it("previews an image proof and labels a PDF", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    const ui = renderModal();
    await ui.user.upload(ui.proof(), png());
    expect(await screen.findByAltText("Xem trước chứng từ")).toHaveAttribute(
      "src",
      "blob:preview",
    );
    api.uploadProof.mockResolvedValueOnce({
      proofKey: "x.pdf",
      proofImageUrl: `/api/v1/admin/orders/${ORDER_ID}/proofs/x.pdf`,
      contentType: "application/pdf",
      size: 3,
    });
    await ui.user.upload(
      ui.proof(),
      new File(["%PDF"], "sao-ke.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByText("sao-ke.pdf")).toBeVisible();
    expect(screen.getByText("PDF")).toBeVisible();
  });
});

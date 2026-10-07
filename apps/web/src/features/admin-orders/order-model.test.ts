import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  adminOrderErrorMessage,
  AUDIT_ACTION_LABELS,
  isPaymentChannel,
  TIMELINE_TITLES,
} from "./order-model";

describe("adminOrderErrorMessage", () => {
  it.each([
    ["ORDER_NOT_RECONCILABLE", 409, /đang chờ thanh toán hoặc đã hết hạn/],
    ["AMOUNT_BELOW_ORDER_TOTAL", 400, /thấp hơn tổng giá trị/],
    ["PROVIDER_TRANSACTION_ALREADY_RECORDED", 409, /đã được ghi nhận/],
    ["ORDER_NOT_REFUNDABLE", 409, /không thể hoàn tiền/],
    ["REFUND_EXCEEDS_REFUNDABLE", 400, /vượt quá số tiền còn có thể hoàn/],
    ["PROOF_NOT_FOUND", 400, /Không tìm thấy chứng từ/],
    ["PROOF_URL_INVALID", 400, /không hợp lệ/],
    ["PROOF_TYPE_NOT_SUPPORTED", 400, /PNG, JPG, WebP hoặc tệp PDF/],
    ["PROOF_TOO_LARGE", 413, /tối đa 5 MB/],
    ["PAYMENT_PROVIDER_REQUEST_FAILED", 502, /Cổng thanh toán/],
  ])("maps %s to Vietnamese", (code, status, expected) => {
    const message = adminOrderErrorMessage(new ApiError(status, [code]));
    expect(message).toMatch(expected);
    expect(message).not.toContain(code);
  });

  it("falls back by status and never leaks unknown machine text", () => {
    expect(adminOrderErrorMessage(new ApiError(403, ["Forbidden"]))).toMatch(
      /không có quyền/,
    );
    expect(
      adminOrderErrorMessage(new ApiError(413, ["File too large"])),
    ).toMatch(/5 MB/);
    expect(adminOrderErrorMessage(new ApiError(500, ["boom"]))).toMatch(
      /Máy chủ/,
    );
    expect(adminOrderErrorMessage(new Error("x"))).toMatch(
      /Không thể hoàn tất/,
    );
    expect(
      adminOrderErrorMessage(new ApiError(0, ["Không thể kết nối máy chủ."])),
    ).toBe("Không thể kết nối máy chủ.");
  });
});

describe("labels", () => {
  it("names every timeline event and audit action in Vietnamese", () => {
    expect(TIMELINE_TITLES.MANUAL_RECONCILED).toBe("Đối soát thủ công");
    expect(TIMELINE_TITLES.ORDER_CREATED).toBe("Đơn hàng được tạo");
    expect(Object.values(TIMELINE_TITLES)).toHaveLength(11);
    expect(Object.values(AUDIT_ACTION_LABELS)).toHaveLength(8);
  });

  it("never offers the ledger-only provider as a checkout channel", () => {
    expect(isPaymentChannel("MANUAL_RECONCILED")).toBe(false);
    expect(isPaymentChannel(null)).toBe(false);
    expect(isPaymentChannel("MOMO")).toBe(true);
  });
});

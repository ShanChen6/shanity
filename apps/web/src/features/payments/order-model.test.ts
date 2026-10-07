import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  effectiveStatus,
  parseFilter,
  parsePage,
  paymentErrorMessage,
} from "./order-model";

describe("effectiveStatus", () => {
  const expiresAt = "2026-10-07T10:00:00.000Z";
  const at = (iso: string) => new Date(iso).getTime();
  it("turns an unpaid order past its deadline into EXPIRED", () => {
    expect(
      effectiveStatus("PENDING", expiresAt, at("2026-10-07T09:59:59Z")),
    ).toBe("PENDING");
    expect(
      effectiveStatus("PENDING", expiresAt, at("2026-10-07T10:00:00Z")),
    ).toBe("EXPIRED");
  });
  it("never downgrades a settled order", () => {
    for (const status of [
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
      "EXPIRED",
    ] as const)
      expect(
        effectiveStatus(status, expiresAt, at("2030-01-01T00:00:00Z")),
      ).toBe(status);
  });
});

describe("query parsing", () => {
  it("falls back safely", () => {
    expect(parseFilter("pending")).toBe("pending");
    expect(parseFilter("hax")).toBe("all");
    expect(parseFilter(null)).toBe("all");
    expect(parsePage("3")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "abc", null, "999999999"])
      expect(parsePage(bad)).toBe(1);
  });
});

describe("paymentErrorMessage", () => {
  it("translates backend codes", () => {
    expect(
      paymentErrorMessage(new ApiError(429, ["TOO_MANY_PENDING_ORDERS"])),
    ).toMatch(/quá nhiều đơn/);
    expect(paymentErrorMessage(new ApiError(409, ["ORDER_EXPIRED"]))).toMatch(
      /hết hạn/,
    );
    expect(
      paymentErrorMessage(
        new ApiError(503, ["PAYMENT_PROVIDER_NOT_CONFIGURED"]),
      ),
    ).toMatch(/thiết lập/);
  });
  it("has sensible fallbacks", () => {
    expect(paymentErrorMessage(new ApiError(404, ["x"]))).toMatch(
      /Không tìm thấy/,
    );
    expect(paymentErrorMessage(new ApiError(500, ["x"]))).toMatch(/Máy chủ/);
    expect(
      paymentErrorMessage(new ApiError(0, ["Không thể kết nối máy chủ."])),
    ).toMatch(/kết nối/);
    expect(paymentErrorMessage(new Error("boom"))).toMatch(
      /Không thể hoàn tất/,
    );
  });
});

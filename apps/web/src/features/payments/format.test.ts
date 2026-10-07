import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDateTime,
  formatMoney,
  plainAmount,
} from "./format";

const norm = (text: string) => text.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("shows VND with dot separators and the dong sign", () => {
    expect(norm(formatMoney(499000, "VND"))).toBe("499.000 ₫");
    expect(norm(formatMoney(0, "VND"))).toBe("0 ₫");
    expect(norm(formatMoney(1500000, "VND"))).toBe("1.500.000 ₫");
  });
  it("shows USD cents as dollars", () => {
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(formatMoney(500, "USD")).toBe("$5.00");
  });
  it("does not hide unknown currencies", () => {
    expect(norm(formatMoney(1000, "EUR"))).toBe("1.000 EUR");
  });
});

describe("plainAmount", () => {
  it("gives the digits a banking app expects", () => {
    expect(plainAmount(499000, "VND")).toBe("499000");
    expect(plainAmount(1999, "USD")).toBe("19.99");
  });
});

describe("formatCountdown", () => {
  it("formats mm:ss and h:mm:ss, never negative", () => {
    expect(formatCountdown(125_000)).toBe("02:05");
    expect(formatCountdown(59_999)).toBe("00:59");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});

describe("formatDateTime", () => {
  it("is tolerant of bad input", () => {
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDateTime("2026-10-07T03:05:00.000Z")).toMatch(/2026/);
  });
});

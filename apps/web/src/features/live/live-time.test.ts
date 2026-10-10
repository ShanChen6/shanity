import { describe, expect, it } from "vitest";
import { clockOffset, countdownParts, formatCountdown, phaseAt } from "./live-time";

const window = {
  status: "SCHEDULED" as const,
  startTime: "2026-10-10T10:00:00.000Z",
  endTime: "2026-10-10T11:00:00.000Z",
};
const at = (iso: string) => Date.parse(iso);

describe("live time", () => {
  it("follows the window, with stored CANCELLED and early ENDED winning", () => {
    expect(phaseAt(window, at("2026-10-10T09:59:59.999Z"))).toBe("SCHEDULED");
    expect(phaseAt(window, at("2026-10-10T10:00:00.000Z"))).toBe("LIVE");
    expect(phaseAt(window, at("2026-10-10T11:00:00.000Z"))).toBe("ENDED");
    expect(phaseAt({ ...window, status: "CANCELLED" }, at("2026-10-10T10:30:00Z"))).toBe("CANCELLED");
    expect(phaseAt({ ...window, status: "ENDED" }, at("2026-10-10T10:30:00Z"))).toBe("ENDED");
  });

  it("counts down in whole seconds and never below zero", () => {
    expect(formatCountdown(15 * 60_000)).toBe("00:15:00");
    expect(formatCountdown(15 * 60_000 - 1)).toBe("00:15:00");
    expect(formatCountdown(14 * 60_000 + 59_000)).toBe("00:14:59");
    expect(formatCountdown(999)).toBe("00:00:01");
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5000)).toBe("00:00:00");
    expect(formatCountdown((2 * 24 + 3) * 3_600_000)).toBe("2 ngày 03:00:00");
    expect(countdownParts(3_661_000)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 });
  });

  it("measures how far the device clock is from the server's", () => {
    expect(clockOffset("2026-10-10T10:00:05.000Z", at("2026-10-10T10:00:00.000Z"))).toBe(5000);
  });
});

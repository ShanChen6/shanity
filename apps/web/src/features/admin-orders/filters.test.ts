import { describe, expect, it } from "vitest";
import {
  amountToApi,
  buildOrdersApiQuery,
  DEFAULT_FILTERS,
  dayEndIso,
  dayStartIso,
  filterProblems,
  hasActiveFilters,
  nextSort,
  parseOrderFilters,
  serializeOrderFilters,
  type OrderFilters,
} from "./filters";

const filters = (patch: Partial<OrderFilters> = {}): OrderFilters => ({
  ...DEFAULT_FILTERS,
  ...patch,
});
const query = (patch: Partial<OrderFilters> = {}) =>
  new URLSearchParams(buildOrdersApiQuery(filters(patch)));

describe("buildOrdersApiQuery", () => {
  it("always sends sorting and paging, and nothing else by default", () => {
    expect(buildOrdersApiQuery(DEFAULT_FILTERS)).toBe(
      "sortBy=createdAt&sortOrder=desc&page=1&limit=20",
    );
  });

  it("sends trimmed search, status and provider", () => {
    const params = query({
      q: "  an.nguyen@example.test ",
      status: "COMPLETED",
      provider: "MANUAL_RECONCILED",
    });
    expect(params.get("q")).toBe("an.nguyen@example.test");
    expect(params.get("status")).toBe("COMPLETED");
    expect(params.get("provider")).toBe("MANUAL_RECONCILED");
  });

  it("converts local days to ISO instants, dateTo being the end of that day", () => {
    const params = query({
      dateField: "completedAt",
      dateFrom: "2026-10-07",
      dateTo: "2026-10-09",
    });
    expect(params.get("dateField")).toBe("completedAt");
    expect(params.get("dateFrom")).toBe(
      new Date(2026, 9, 7, 0, 0, 0, 0).toISOString(),
    );
    expect(params.get("dateTo")).toBe(
      new Date(2026, 9, 9, 23, 59, 59, 999).toISOString(),
    );
  });

  it("covers the whole day when both bounds are the same day", () => {
    const from = new Date(dayStartIso("2026-10-07")!).getTime();
    const to = new Date(dayEndIso("2026-10-07")!).getTime();
    expect(to - from).toBe(24 * 3600 * 1000 - 1);
  });

  it("omits the date field when no date bound is set", () => {
    expect(query({ dateField: "completedAt" }).has("dateField")).toBe(false);
  });

  it("ignores impossible calendar days", () => {
    expect(dayStartIso("2026-02-31")).toBeUndefined();
    expect(dayEndIso("not-a-date")).toBeUndefined();
    expect(query({ dateFrom: "2026-13-01" }).has("dateFrom")).toBe(false);
  });

  it("sends amounts as integer minor units (VND: whole units are dong)", () => {
    const params = query({ amountMin: "500000", amountMax: "2000000" });
    expect(params.get("amountMin")).toBe("500000");
    expect(params.get("amountMax")).toBe("2000000");
    expect(amountToApi("0")).toBe(0);
    expect(amountToApi("12.5")).toBeUndefined();
    expect(amountToApi("-1")).toBeUndefined();
    expect(amountToApi("")).toBeUndefined();
    expect(amountToApi("1".repeat(16))).toBeUndefined();
  });

  it("sends sorting and paging", () => {
    const params = query({
      sortBy: "finalTotal",
      sortOrder: "asc",
      page: 3,
      limit: 50,
    });
    expect(params.get("sortBy")).toBe("finalTotal");
    expect(params.get("sortOrder")).toBe("asc");
    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("50");
  });
});

describe("URL state", () => {
  it("round-trips every filter and keeps defaults out of the URL", () => {
    const full = filters({
      q: "react",
      status: "REFUNDED",
      provider: "STRIPE",
      dateField: "completedAt",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      amountMin: "1000",
      amountMax: "9000",
      sortBy: "code",
      sortOrder: "asc",
      page: 2,
      limit: 10,
    });
    const url = serializeOrderFilters(full);
    expect(parseOrderFilters(url)).toEqual(full);
    expect(serializeOrderFilters(DEFAULT_FILTERS).toString()).toBe("");
  });

  it("falls back to defaults for anything it does not recognise", () => {
    const parsed = parseOrderFilters(
      new URLSearchParams({
        status: "PROCESSING",
        provider: "PAYPAL",
        dateFrom: "2026-02-30",
        amountMin: "-5",
        amountMax: "1e6",
        sortBy: "password",
        sortOrder: "sideways",
        page: "0",
        limit: "1000",
      }),
    );
    expect(parsed).toEqual(DEFAULT_FILTERS);
  });
});

describe("filterProblems", () => {
  it("flags ranges the API would reject", () => {
    expect(
      filterProblems(filters({ dateFrom: "2026-10-09", dateTo: "2026-10-07" }))
        .dates,
    ).toMatch(/Ngày bắt đầu/);
    expect(
      filterProblems(filters({ amountMin: "900", amountMax: "100" })).amounts,
    ).toMatch(/Số tiền tối thiểu/);
    expect(
      filterProblems(filters({ dateFrom: "2026-10-07", dateTo: "2026-10-07" })),
    ).toEqual({});
  });
});

describe("hasActiveFilters / nextSort", () => {
  it("does not count sorting or paging as filters", () => {
    expect(hasActiveFilters(filters({ sortBy: "code", page: 4 }))).toBe(false);
    expect(hasActiveFilters(filters({ amountMax: "1" }))).toBe(true);
  });

  it("flips the active column and starts a new one in its natural order", () => {
    expect(
      nextSort({ sortBy: "createdAt", sortOrder: "desc" }, "createdAt"),
    ).toEqual({ sortBy: "createdAt", sortOrder: "asc" });
    expect(
      nextSort({ sortBy: "createdAt", sortOrder: "desc" }, "finalTotal"),
    ).toEqual({ sortBy: "finalTotal", sortOrder: "desc" });
    expect(
      nextSort({ sortBy: "createdAt", sortOrder: "desc" }, "studentName"),
    ).toEqual({ sortBy: "studentName", sortOrder: "asc" });
  });
});

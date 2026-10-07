import { LIST_PROVIDERS, LIST_STATUSES } from "./order-model";
import type { LedgerProvider, OrderStatus } from "./types";

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_LIMIT = 20;
export const SORT_FIELDS = [
  "createdAt",
  "finalTotal",
  "code",
  "status",
  "studentName",
  "completedAt",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";
export type DateField = "createdAt" | "completedAt";

/** The console's state, exactly as it lives in the URL query string. */
export type OrderFilters = {
  q: string;
  status: OrderStatus | "";
  provider: LedgerProvider | "";
  dateField: DateField;
  /** Local calendar days, YYYY-MM-DD, as a date input holds them. */
  dateFrom: string;
  dateTo: string;
  /** Whole currency units, digits only (see amountToApi). */
  amountMin: string;
  amountMax: string;
  sortBy: SortField;
  sortOrder: SortOrder;
  page: number;
  limit: number;
};

export const DEFAULT_FILTERS: OrderFilters = {
  q: "",
  status: "",
  provider: "",
  dateField: "createdAt",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  sortBy: "createdAt",
  sortOrder: "desc",
  page: 1,
  limit: DEFAULT_LIMIT,
};

const MAX_QUERY_LENGTH = 100;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT_PATTERN = /^\d{1,15}$/;

/** A real calendar day (rejects 2026-02-31), else null. */
function parseDay(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? { year, month, day }
    : null;
}

/** First instant of that local day, as the ISO string the API expects. */
export function dayStartIso(value: string): string | undefined {
  const day = parseDay(value);
  return day
    ? new Date(day.year, day.month - 1, day.day, 0, 0, 0, 0).toISOString()
    : undefined;
}

/** Last instant of that local day: `dateTo` is inclusive of the whole day. */
export function dayEndIso(value: string): string | undefined {
  const day = parseDay(value);
  return day
    ? new Date(day.year, day.month - 1, day.day, 23, 59, 59, 999).toISOString()
    : undefined;
}

/**
 * The API filters on the order total in minor units. VND (the platform's
 * currency) has no minor unit, so whole units typed by staff are sent as-is;
 * USD orders would need x100, which this console does not offer.
 */
export function amountToApi(value: string): number | undefined {
  if (!AMOUNT_PATTERN.test(value)) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

type ParamSource = { get(name: string): string | null };

export function parseOrderFilters(params: ParamSource): OrderFilters {
  const text = (name: string) => params.get(name) ?? "";
  const status = text("status");
  const provider = text("provider");
  const sortBy = text("sortBy");
  const sortOrder = text("sortOrder");
  const page = Number(text("page"));
  const limit = Number(text("limit"));
  const day = (name: string) => (parseDay(text(name)) ? text(name) : "");
  const amount = (name: string) =>
    AMOUNT_PATTERN.test(text(name)) ? String(Number(text(name))) : "";
  return {
    q: text("q").trim().slice(0, MAX_QUERY_LENGTH),
    status: LIST_STATUSES.includes(status as OrderStatus)
      ? (status as OrderStatus)
      : "",
    provider: LIST_PROVIDERS.includes(provider as LedgerProvider)
      ? (provider as LedgerProvider)
      : "",
    dateField:
      text("dateField") === "completedAt" ? "completedAt" : "createdAt",
    dateFrom: day("dateFrom"),
    dateTo: day("dateTo"),
    amountMin: amount("amountMin"),
    amountMax: amount("amountMax"),
    sortBy: SORT_FIELDS.includes(sortBy as SortField)
      ? (sortBy as SortField)
      : DEFAULT_FILTERS.sortBy,
    sortOrder:
      sortOrder === "asc" || sortOrder === "desc"
        ? sortOrder
        : DEFAULT_FILTERS.sortOrder,
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    limit: PAGE_SIZES.includes(limit as (typeof PAGE_SIZES)[number])
      ? limit
      : DEFAULT_LIMIT,
  };
}

/** Browser URL: only what differs from the defaults, so links stay short. */
export function serializeOrderFilters(filters: OrderFilters): URLSearchParams {
  const params = new URLSearchParams();
  const set = (
    name: string,
    value: string | number,
    fallback: string | number,
  ) => {
    if (value !== fallback && value !== "") params.set(name, String(value));
  };
  set("q", filters.q.trim(), "");
  set("status", filters.status, "");
  set("provider", filters.provider, "");
  set("dateField", filters.dateField, DEFAULT_FILTERS.dateField);
  set("dateFrom", filters.dateFrom, "");
  set("dateTo", filters.dateTo, "");
  set("amountMin", filters.amountMin, "");
  set("amountMax", filters.amountMax, "");
  set("sortBy", filters.sortBy, DEFAULT_FILTERS.sortBy);
  set("sortOrder", filters.sortOrder, DEFAULT_FILTERS.sortOrder);
  set("page", filters.page, 1);
  set("limit", filters.limit, DEFAULT_LIMIT);
  return params;
}

/** Query string for GET /api/v1/admin/orders (instants and minor units). */
export function buildOrdersApiQuery(filters: OrderFilters): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q.slice(0, MAX_QUERY_LENGTH));
  if (filters.status) params.set("status", filters.status);
  if (filters.provider) params.set("provider", filters.provider);
  const from = dayStartIso(filters.dateFrom);
  const to = dayEndIso(filters.dateTo);
  if (from || to) params.set("dateField", filters.dateField);
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  const min = amountToApi(filters.amountMin);
  const max = amountToApi(filters.amountMax);
  if (min !== undefined) params.set("amountMin", String(min));
  if (max !== undefined) params.set("amountMax", String(max));
  params.set("sortBy", filters.sortBy);
  params.set("sortOrder", filters.sortOrder);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  return params.toString();
}

export type FilterProblems = { dates?: string; amounts?: string };

/** Ranges the API would reject; caught here so no request is wasted. */
export function filterProblems(filters: OrderFilters): FilterProblems {
  const problems: FilterProblems = {};
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    problems.dates = "Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.";
  const min = amountToApi(filters.amountMin);
  const max = amountToApi(filters.amountMax);
  if (min !== undefined && max !== undefined && min > max)
    problems.amounts =
      "Số tiền tối thiểu phải nhỏ hơn hoặc bằng số tiền tối đa.";
  return problems;
}

/** Any narrowing filter (sorting and paging do not count). */
export function hasActiveFilters(filters: OrderFilters): boolean {
  return Boolean(
    filters.q ||
    filters.status ||
    filters.provider ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.amountMin ||
    filters.amountMax,
  );
}

const FIRST_DIRECTION: Record<SortField, SortOrder> = {
  createdAt: "desc",
  completedAt: "desc",
  finalTotal: "desc",
  code: "asc",
  status: "asc",
  studentName: "asc",
};

/** Clicking the active column flips it; a new column starts in its natural order. */
export function nextSort(
  current: Pick<OrderFilters, "sortBy" | "sortOrder">,
  field: SortField,
): Pick<OrderFilters, "sortBy" | "sortOrder"> {
  if (current.sortBy === field)
    return {
      sortBy: field,
      sortOrder: current.sortOrder === "asc" ? "desc" : "asc",
    };
  return { sortBy: field, sortOrder: FIRST_DIRECTION[field] };
}

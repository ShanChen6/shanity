import { api } from "@/lib/api";
import type {
  CheckoutSession,
  OrderListFilter,
  OrderStatusSnapshot,
  PaymentMethod,
  PaymentProvider,
  StudentOrder,
  StudentOrderPage,
} from "./types";

const enc = encodeURIComponent;

export const paymentKeys = {
  order: (code: string) => ["payments", "order", code] as const,
  orders: (filter: OrderListFilter, page: number) =>
    ["payments", "orders", filter, page] as const,
  allOrders: ["payments", "orders"] as const,
  methods: (currency: string) => ["payments", "methods", currency] as const,
};

export const createOrder = (courseIds: string[]) =>
  api<StudentOrder>("/api/v1/orders", {
    method: "POST",
    body: JSON.stringify({ courseIds }),
  });

export const fetchOrder = (code: string, signal?: AbortSignal) =>
  api<StudentOrder>(`/api/v1/orders/${enc(code)}`, { signal });

/** The poll target: tiny response, one indexed lookup server-side. */
export const fetchOrderStatus = (code: string, signal?: AbortSignal) =>
  api<OrderStatusSnapshot>(`/api/v1/orders/${enc(code)}/status`, { signal });

export const fetchStudentOrders = (
  filter: OrderListFilter,
  page: number,
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams({ page: String(page), limit: "10" });
  if (filter !== "all") query.set("status", filter);
  return api<StudentOrderPage>(`/api/v1/student/orders?${query}`, { signal });
};

export const fetchPaymentMethods = (currency: string, signal?: AbortSignal) =>
  api<PaymentMethod[]>(`/api/v1/payments/methods?currency=${enc(currency)}`, {
    signal,
  });

export const startCheckout = (code: string, provider: PaymentProvider) =>
  api<CheckoutSession>(`/api/v1/orders/${enc(code)}/checkout`, {
    method: "POST",
    body: JSON.stringify({ provider }),
  });

export const enrollFree = (courseId: string) =>
  api<{ message: string; enrollmentId: string }>("/api/v1/enrollments/free", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });

import { ApiError } from "@/lib/api";
import type { OrderListFilter, OrderStatus, PaymentProvider } from "./types";

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/**
 * The status to show. The server flips PENDING to EXPIRED in a periodic sweep,
 * so a PENDING order past its deadline is already expired for the buyer.
 * `now` must be server-aligned (see useOrderStatus' clock offset).
 */
export function effectiveStatus(
  status: OrderStatus,
  expiresAt: string,
  now: number,
): OrderStatus {
  return status === "PENDING" && now >= new Date(expiresAt).getTime()
    ? "EXPIRED"
    : status;
}

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: "warning" | "success" | "danger" | "neutral" | "info" }
> = {
  PENDING: { label: "Đang chờ thanh toán", tone: "warning" },
  PROCESSING: { label: "Đang xử lý", tone: "info" },
  COMPLETED: { label: "Hoàn tất", tone: "success" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
  CANCELLED: { label: "Đã hủy", tone: "danger" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "info" },
};

export const FILTERS: { value: OrderListFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Đang chờ" },
  { value: "completed", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã hủy" },
];

export function parseFilter(value: string | null): OrderListFilter {
  return FILTERS.some((filter) => filter.value === value)
    ? (value as OrderListFilter)
    : "all";
}

export function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1;
}

export const PROVIDER_META: Record<
  PaymentProvider,
  { label: string; description: string }
> = {
  VIETQR: {
    label: "Chuyển khoản ngân hàng (VietQR)",
    description: "Quét mã QR bằng ứng dụng ngân hàng. Xác nhận trong vài giây.",
  },
  STRIPE: {
    label: "Thẻ quốc tế (Stripe)",
    description: "Visa, Mastercard… qua trang thanh toán bảo mật của Stripe.",
  },
  MOMO: { label: "Ví MoMo", description: "Thanh toán bằng ví điện tử MoMo." },
  VNPAY: { label: "VNPay", description: "Thanh toán qua cổng VNPay." },
  MANUAL_BANK: {
    label: "Chuyển khoản thủ công",
    description: "Chuyển khoản và chờ xác nhận.",
  },
};

export const providerLabel = (provider: PaymentProvider | null) =>
  provider ? PROVIDER_META[provider].label : "—";

const MESSAGES: Record<string, string> = {
  TOO_MANY_PENDING_ORDERS:
    "Bạn đang có quá nhiều đơn chưa thanh toán. Hãy hoàn tất hoặc đợi các đơn cũ hết hạn.",
  ALREADY_ENROLLED: "Bạn đã sở hữu khóa học này.",
  COURSE_NOT_FOUND: "Khóa học không còn khả dụng.",
  COURSE_IS_FREE: "Khóa học này miễn phí, bạn có thể đăng ký trực tiếp.",
  MIXED_CURRENCY_ORDER:
    "Không thể thanh toán chung các khóa khác loại tiền tệ.",
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  ORDER_EXPIRED: "Đơn hàng đã hết hạn. Vui lòng tạo đơn mới.",
  ORDER_NOT_PAYABLE: "Đơn hàng này không còn có thể thanh toán.",
  PAYMENT_PROVIDER_UNAVAILABLE: "Phương thức thanh toán này chưa khả dụng.",
  PAYMENT_PROVIDER_NOT_CONFIGURED:
    "Phương thức thanh toán này đang được thiết lập. Vui lòng chọn phương thức khác.",
  PAYMENT_CURRENCY_NOT_SUPPORTED:
    "Phương thức này không hỗ trợ loại tiền của đơn hàng.",
  INVALID_REDIRECT_URL: "Địa chỉ quay lại không hợp lệ.",
  PAYMENT_PROVIDER_REQUEST_FAILED:
    "Cổng thanh toán đang gặp sự cố. Vui lòng thử lại sau ít phút.",
  PAYMENT_PROVIDER_UNREACHABLE:
    "Không kết nối được cổng thanh toán. Vui lòng thử lại.",
};

/** Maps backend error codes to Vietnamese copy; falls back to generic text. */
export function paymentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    for (const message of error.messages) {
      if (MESSAGES[message]) return MESSAGES[message];
    }
    if (error.status === 429)
      return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
    if (error.status === 404) return MESSAGES.ORDER_NOT_FOUND;
    if (error.status === 0) return error.message;
    if (error.status >= 500)
      return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  }
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

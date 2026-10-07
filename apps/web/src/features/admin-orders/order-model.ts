import { ApiError } from "@/lib/api";
import type {
  AuditAction,
  EnrollmentState,
  LedgerProvider,
  LedgerStatus,
  OrderStatus,
  PaymentChannel,
  RefundStatus,
  TimelineEventType,
} from "./types";

export const PROVIDER_LABELS: Record<LedgerProvider, string> = {
  VIETQR: "VietQR",
  STRIPE: "Stripe",
  MOMO: "MoMo",
  VNPAY: "VNPay",
  MANUAL_BANK: "Chuyển khoản thủ công",
  MANUAL_RECONCILED: "Đối soát thủ công",
};
export const providerLabel = (provider: LedgerProvider | null) =>
  provider ? PROVIDER_LABELS[provider] : "—";

/** What a manual reconciliation may name as the channel the student used. */
export const RECONCILE_CHANNELS: readonly PaymentChannel[] = [
  "VIETQR",
  "STRIPE",
  "MOMO",
  "VNPAY",
  "MANUAL_BANK",
];
export const isPaymentChannel = (
  provider: LedgerProvider | null,
): provider is PaymentChannel =>
  !!provider && RECONCILE_CHANNELS.includes(provider as PaymentChannel);

export const LIST_PROVIDERS: readonly LedgerProvider[] = [
  ...RECONCILE_CHANNELS,
  "MANUAL_RECONCILED",
];

// PROCESSING is transient and never a useful filter in the console.
export const LIST_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
];

export const LEDGER_STATUS_LABELS: Record<LedgerStatus, string> = {
  INITIATED: "Đã khởi tạo",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
  PARTIALLY_REFUNDED: "Hoàn một phần",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  NONE: "Chưa hoàn tiền",
  PARTIALLY_REFUNDED: "Hoàn một phần",
  REFUNDED: "Đã hoàn toàn bộ",
};

export const ENROLLMENT_LABELS: Record<
  EnrollmentState,
  { label: string; tone: "success" | "danger" | "neutral" }
> = {
  ACTIVE: { label: "Đang có quyền học", tone: "success" },
  REVOKED: { label: "Đã thu hồi", tone: "danger" },
  NONE: { label: "Chưa cấp quyền", tone: "neutral" },
};

export const TIMELINE_TITLES: Record<TimelineEventType, string> = {
  ORDER_CREATED: "Đơn hàng được tạo",
  PAYMENT_INITIATED: "Khởi tạo thanh toán",
  WEBHOOK_RECEIVED: "Nhận webhook",
  PAYMENT_FAILED: "Thanh toán thất bại",
  MANUAL_RECONCILED: "Đối soát thủ công",
  ORDER_COMPLETED: "Đơn hàng hoàn tất",
  ENROLLMENT_GRANTED: "Cấp quyền học",
  REFUND_ISSUED: "Hoàn tiền",
  ENROLLMENT_REVOKED: "Thu hồi quyền học",
  ORDER_EXPIRED: "Đơn hàng hết hạn",
  ORDER_CANCELLED: "Đơn hàng bị hủy",
};

export const TIMELINE_TONES: Record<
  TimelineEventType,
  "success" | "danger" | "warning" | "neutral"
> = {
  ORDER_CREATED: "neutral",
  PAYMENT_INITIATED: "neutral",
  WEBHOOK_RECEIVED: "success",
  PAYMENT_FAILED: "danger",
  MANUAL_RECONCILED: "warning",
  ORDER_COMPLETED: "success",
  ENROLLMENT_GRANTED: "success",
  REFUND_ISSUED: "warning",
  ENROLLMENT_REVOKED: "danger",
  ORDER_EXPIRED: "neutral",
  ORDER_CANCELLED: "danger",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: "Tạo đơn hàng",
  STATUS_CHANGED: "Thay đổi trạng thái",
  MANUAL_RECONCILED: "Đối soát thủ công",
  REFUND_ISSUED: "Hoàn tiền",
  ENROLLMENT_REVOKED: "Thu hồi quyền học",
  NOTE_ADDED: "Thêm ghi chú",
  DETAIL_VIEWED: "Xem chi tiết đơn hàng",
  PROOF_UPLOADED: "Tải lên chứng từ",
};

/** The smallest unit the console's amount fields use, for field labels. */
export const minorUnitName = (currency: string) =>
  currency === "USD" ? "cent" : "đồng";

const MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  ORDER_NOT_RECONCILABLE:
    "Chỉ có thể đối soát đơn đang chờ thanh toán hoặc đã hết hạn.",
  AMOUNT_BELOW_ORDER_TOTAL: "Số tiền nhận được thấp hơn tổng giá trị đơn hàng.",
  PROVIDER_TRANSACTION_ALREADY_RECORDED:
    "Mã giao dịch này đã được ghi nhận cho một khoản thanh toán khác.",
  PROVIDER_TRANSACTION_ID_REUSED:
    "Mã giao dịch này đã được ghi nhận cho một khoản thanh toán khác.",
  PROVIDER_TRANSACTION_ID_INVALID: "Mã giao dịch ngân hàng không hợp lệ.",
  ORDER_NOT_REFUNDABLE: "Đơn hàng này hiện không thể hoàn tiền.",
  REFUND_EXCEEDS_REFUNDABLE:
    "Số tiền hoàn vượt quá số tiền còn có thể hoàn của đơn hàng.",
  REFUND_EXCEEDS_PAID_AMOUNT: "Số tiền hoàn vượt quá số tiền đã thanh toán.",
  PROOF_REQUIRED: "Vui lòng chọn tệp chứng từ.",
  PROOF_NOT_FOUND: "Không tìm thấy chứng từ. Vui lòng tải lên lại.",
  PROOF_URL_INVALID: "Đường dẫn chứng từ không hợp lệ.",
  PROOF_TYPE_NOT_SUPPORTED: "Chứng từ phải là ảnh PNG, JPG, WebP hoặc tệp PDF.",
  PROOF_TOO_LARGE: "Chứng từ quá lớn. Vui lòng chọn tệp tối đa 5 MB.",
  PAYMENT_PROVIDER_REQUEST_FAILED:
    "Cổng thanh toán từ chối hoặc không xử lý được yêu cầu hoàn tiền. Chưa có khoản nào được ghi nhận.",
  PAYMENT_PROVIDER_UNREACHABLE:
    "Không kết nối được cổng thanh toán. Chưa có khoản nào được ghi nhận, vui lòng thử lại.",
  DATE_RANGE_INVALID:
    "Khoảng ngày không hợp lệ: ngày bắt đầu sau ngày kết thúc.",
  AMOUNT_RANGE_INVALID:
    "Khoảng số tiền không hợp lệ: tối thiểu lớn hơn tối đa.",
};

/** Maps the API's machine-readable errors to Vietnamese; generic otherwise. */
export function adminOrderErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    for (const message of error.messages) {
      if (MESSAGES[message]) return MESSAGES[message];
    }
    if (error.status === 0) return error.message;
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return MESSAGES.ORDER_NOT_FOUND;
    if (error.status === 413) return MESSAGES.PROOF_TOO_LARGE;
    if (error.status === 429)
      return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
    if (error.status === 400 || error.status === 422)
      return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
    if (error.status === 409)
      return "Trạng thái đơn hàng đã thay đổi. Vui lòng đóng và mở lại đơn hàng.";
    if (error.status >= 500)
      return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  }
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

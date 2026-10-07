import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type {
  CheckoutSession,
  OrderStatusSnapshot,
  PaymentMethod,
  StudentOrder,
} from "./types";

const router = { push: vi.fn(), replace: vi.fn() };
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/checkout/SHAN-20261007-X89K",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const api = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  fetchOrderStatus: vi.fn(),
  fetchPaymentMethods: vi.fn(),
  startCheckout: vi.fn(),
  createOrder: vi.fn(),
}));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, ...api };
});

import { CheckoutView } from "./checkout-view";

const CODE = "SHAN-20261007-X89K";
const order = (overrides: Partial<StudentOrder> = {}): StudentOrder => ({
  orderId: "11111111-1111-4111-8111-111111111111",
  code: CODE,
  status: "PENDING",
  currency: "VND",
  subtotal: 499000,
  discountTotal: 0,
  finalTotal: 499000,
  paymentProvider: null,
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  items: [
    {
      id: "i1",
      courseId: "c1",
      courseTitleSnapshot: "Khóa học A",
      unitPriceSnapshot: 499000,
      discountSnapshot: 0,
      finalPriceSnapshot: 499000,
      currency: "VND",
      courseSlug: "khoa-hoc-a",
    },
  ],
  providerTransactionId: null,
  canResume: true,
  ...overrides,
});
const snapshot = (
  status: OrderStatusSnapshot["status"],
  expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(),
): OrderStatusSnapshot => ({
  status,
  isPaid: status === "COMPLETED",
  expiresAt,
  serverTime: new Date().toISOString(),
});
const methods = (
  overrides: Partial<Record<string, Partial<PaymentMethod>>> = {},
): PaymentMethod[] =>
  (["VIETQR", "STRIPE", "MOMO", "VNPAY", "MANUAL_BANK"] as const).map(
    (provider) => ({
      provider,
      registered: provider === "VIETQR" || provider === "STRIPE",
      available: provider === "VIETQR" || provider === "STRIPE",
      supportsCurrency: true,
      ...overrides[provider],
    }),
  );
const bankSession: CheckoutSession = {
  orderId: "11111111-1111-4111-8111-111111111111",
  orderCode: CODE,
  provider: "VIETQR",
  providerTransactionId: `VIETQR-${CODE}`,
  qrCodeUrl:
    "https://img.vietqr.io/image/MB-0123456789-compact2.png?amount=499000",
  transfer: {
    bankId: "MB",
    bankName: "MB Bank",
    accountNo: "0123456789",
    accountName: "SHANITY EDU",
    amount: 499000,
    content: "SHAN20261007X89K",
  },
  amount: 499000,
  currency: "VND",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
};

function renderCheckout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CheckoutView orderCode={CODE} />
    </QueryClientProvider>,
  );
}
const flush = () => act(() => vi.advanceTimersByTimeAsync(20));

describe("CheckoutView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    search = "";
    Object.values(api).forEach((mock) => mock.mockReset());
    router.push.mockReset();
    router.replace.mockReset();
    api.fetchOrder.mockResolvedValue(order());
    api.fetchOrderStatus.mockResolvedValue(snapshot("PENDING"));
    api.fetchPaymentMethods.mockResolvedValue(methods());
    api.startCheckout.mockResolvedValue(bankSession);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the frozen order, the VietQR panel, copy fields and a live countdown", async () => {
    renderCheckout();
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeInTheDocument();
    await flush();
    await flush();

    expect(screen.getByText("Khóa học A")).toBeInTheDocument();
    expect(
      screen.getByTestId("order-total").textContent?.replace(/\s/g, " "),
    ).toBe("499.000 ₫");
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/1[45]:\d\d/);

    // VietQR is chosen by default and its (idempotent) QR is requested once
    expect(api.startCheckout).toHaveBeenCalledTimes(1);
    expect(api.startCheckout).toHaveBeenCalledWith(CODE, "VIETQR");
    const qr = screen.getByRole("img", { name: /Mã QR chuyển khoản/ });
    expect(qr).toHaveAttribute("src", bankSession.qrCodeUrl);
    expect(screen.getByText(/0123456789 · MB Bank/)).toBeInTheDocument();
    expect(screen.getByText("SHAN20261007X89K")).toBeInTheDocument();
    expect(
      screen.getByText(/đang chờ ngân hàng xác nhận giao dịch/),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /VietQR/ })).toBeChecked();

    // the countdown ticks
    const before = screen.getByRole("timer").textContent;
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole("timer").textContent).not.toBe(before);
  });

  it("copies account number, amount and transfer content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderCheckout();
    await flush();
    await flush();

    for (const [name, value] of [
      [/Sao chép số tài khoản/, "0123456789"],
      [/Sao chép số tiền/, "499000"],
      [/Sao chép nội dung chuyển khoản/, "SHAN20261007X89K"],
    ] as const) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name }));
      });
      expect(writeText).toHaveBeenLastCalledWith(value);
    }
    expect(screen.getAllByText("Đã chép").length).toBeGreaterThan(0);
  });

  it("switches to SUCCESS with confetti when the poll sees the webhook, no refresh", async () => {
    renderCheckout();
    await flush();
    await flush();
    expect(
      screen.queryByText("Thanh toán thành công!"),
    ).not.toBeInTheDocument();

    // backend receives the webhook; the next poll reports it
    api.fetchOrderStatus.mockResolvedValue(snapshot("COMPLETED"));
    api.fetchOrder.mockResolvedValue(
      order({
        status: "COMPLETED",
        providerTransactionId: "FT26280123",
        paymentProvider: "VIETQR",
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await flush();

    expect(screen.getByText("Thanh toán thành công!")).toBeInTheDocument();
    expect(screen.getByTestId("confetti")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Bắt đầu học ngay" }),
    ).toHaveAttribute("href", "/learn/khoa-hoc-a");
    expect(screen.getByText("FT26280123")).toBeInTheDocument(); // transaction code
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    // polling stopped
    const calls = api.fetchOrderStatus.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api.fetchOrderStatus).toHaveBeenCalledTimes(calls);
  });

  it("shows the failure screen for an expired order and creates a new one on retry", async () => {
    const expired = order({ status: "EXPIRED", canResume: false });
    api.fetchOrder.mockResolvedValue(expired);
    api.fetchOrderStatus.mockResolvedValue(
      snapshot("EXPIRED", new Date(Date.now() - 60_000).toISOString()),
    );
    api.createOrder.mockResolvedValue(order({ code: "SHAN-20261007-NEW1" }));
    renderCheckout();
    await flush();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Đơn hàng đã hết hạn");
    expect(screen.getByText(/vẫn tự ghi nhận/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Thử thanh toán lại" }),
      );
    });
    await flush();
    expect(api.createOrder).toHaveBeenCalledWith(["c1"]);
    expect(router.replace).toHaveBeenCalledWith("/checkout/SHAN-20261007-NEW1");
  });

  it("an expired page flips to SUCCESS if the late webhook arrives", async () => {
    api.fetchOrder.mockResolvedValue(
      order({ status: "EXPIRED", canResume: false }),
    );
    api.fetchOrderStatus.mockResolvedValue(
      snapshot("EXPIRED", new Date(Date.now() - 60_000).toISOString()),
    );
    renderCheckout();
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    api.fetchOrderStatus.mockResolvedValue(snapshot("COMPLETED"));
    api.fetchOrder.mockResolvedValue(order({ status: "COMPLETED" }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await flush();
    expect(screen.getByText("Thanh toán thành công!")).toBeInTheDocument();
  });

  it("shows cancelled and refunded orders without polling", async () => {
    api.fetchOrder.mockResolvedValue(
      order({ status: "CANCELLED", canResume: false }),
    );
    const { unmount } = renderCheckout();
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Đơn hàng đã bị hủy");
    expect(api.fetchOrderStatus).not.toHaveBeenCalled();
    unmount();

    api.fetchOrder.mockResolvedValue(
      order({ status: "REFUNDED", canResume: false }),
    );
    renderCheckout();
    await flush();
    await flush();
    expect(screen.getByText("Đơn hàng đã được hoàn tiền")).toBeInTheDocument();
  });

  it("handles a missing order and a server error with a retry", async () => {
    api.fetchOrder.mockRejectedValueOnce(
      new ApiError(404, ["ORDER_NOT_FOUND"]),
    );
    const { unmount } = renderCheckout();
    await flush();
    await flush();
    expect(screen.getByText("Không tìm thấy đơn hàng")).toBeInTheDocument();
    unmount();

    api.fetchOrder.mockRejectedValueOnce(new ApiError(500, ["x"]));
    renderCheckout();
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể tải đơn hàng",
    );
    api.fetchOrder.mockResolvedValue(order());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    });
    await flush();
    await flush();
    expect(screen.getByText("Khóa học A")).toBeInTheDocument();
  });

  it("greys out unavailable gateways and explains why", async () => {
    renderCheckout();
    await flush();
    await flush();
    const momo = screen.getByRole("radio", { name: /MoMo/ });
    expect(momo).toBeDisabled();
    expect(
      within(momo.closest("label")!).getByText("Sắp ra mắt"),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Stripe/ })).toBeEnabled();
  });

  it("tells a configured-but-down gateway apart from one not built yet", async () => {
    api.fetchPaymentMethods.mockResolvedValue(
      methods({ STRIPE: { available: false } }),
    );
    renderCheckout();
    await flush();
    await flush();
    const stripe = screen.getByRole("radio", { name: /Stripe/ });
    expect(stripe).toBeDisabled();
    expect(
      within(stripe.closest("label")!).getByText("Tạm thời chưa khả dụng"),
    ).toBeInTheDocument();
  });

  it("reports a gateway failure and lets the student retry", async () => {
    api.startCheckout.mockRejectedValueOnce(
      new ApiError(503, ["PAYMENT_PROVIDER_NOT_CONFIGURED"]),
    );
    renderCheckout();
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/đang được thiết lập/);
    api.startCheckout.mockResolvedValue(bankSession);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    });
    await flush();
    expect(screen.getByRole("img", { name: /Mã QR/ })).toBeInTheDocument();
  });

  it("sends the student to Stripe only after an explicit click", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      configurable: true,
    });
    api.fetchPaymentMethods.mockResolvedValue(
      methods({ VIETQR: { available: false } }),
    );
    api.startCheckout.mockResolvedValue({
      ...bankSession,
      provider: "STRIPE",
      qrCodeUrl: undefined,
      transfer: undefined,
      paymentUrl: "https://checkout.stripe.test/c/pay/cs_1",
    });
    renderCheckout();
    await flush();
    await flush();
    expect(api.startCheckout).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Stripe/ })).toBeChecked();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Thanh toán với Stripe/ }),
      );
    });
    await flush();
    expect(api.startCheckout).toHaveBeenCalledWith(CODE, "STRIPE");
    expect(assign).toHaveBeenCalledWith(
      "https://checkout.stripe.test/c/pay/cs_1",
    );
  });

  it("acknowledges the return from the gateway while it waits for confirmation", async () => {
    search = "checkout=success";
    renderCheckout();
    await flush();
    await flush();
    expect(screen.getByText("Đang xác nhận thanh toán")).toBeInTheDocument();
  });

  it("warns, but keeps the page, when polling loses the network", async () => {
    renderCheckout();
    await flush();
    await flush();
    api.fetchOrderStatus.mockRejectedValue(new ApiError(0, ["offline"]));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await flush();
    expect(screen.getByText(/mất kết nối/)).toBeInTheDocument();
    expect(screen.getByText("Khóa học A")).toBeInTheDocument();
  });
});

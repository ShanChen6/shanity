import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { CoursePricing } from "./course-cta";

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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
let session: { user: { id: string; roles: string[] } | null; status: string } =
  {
    user: null,
    status: "anonymous",
  };
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => session,
}));
const pay = vi.hoisted(() => ({ createOrder: vi.fn(), enrollFree: vi.fn() }));
vi.mock("@/features/payments/api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/payments/api")
  >("@/features/payments/api");
  return { ...actual, ...pay };
});
const core = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: core.api };
});

import { CourseCta } from "./course-cta";

const paid: CoursePricing = {
  id: "c1",
  slug: "khoa-hoc-a",
  accessType: "PAID",
  price: 499000,
  currency: "VND",
};
const free: CoursePricing = { ...paid, accessType: "FREE", price: 0 };

function renderCta(course: CoursePricing) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CourseCta course={course} />
    </QueryClientProvider>,
  );
}
// React Query batches notifications with setTimeout; give it a few turns.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  });
const enrollment = (isEnrolled: boolean) =>
  core.api.mockImplementation(async (path: string) => {
    if (path.endsWith("/enrollment-status")) return { isEnrolled };
    if (path.endsWith("/resume-lesson"))
      return {
        lessonSlug: null,
        lessonTitle: null,
        lastPosition: 0,
        hasStarted: false,
      };
    throw new Error(`unexpected ${path}`);
  });

describe("CourseCta", () => {
  beforeEach(() => {
    session = {
      user: { id: "u1", roles: ["student"] },
      status: "authenticated",
    };
    router.push.mockReset();
    pay.createOrder.mockReset();
    pay.enrollFree.mockReset();
    core.api.mockReset();
  });

  it("signed out + PAID: price and Mua khóa học via login that returns here", () => {
    session = { user: null, status: "anonymous" };
    renderCta(paid);
    expect(screen.getByLabelText(/Giá 499\.000/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Mua khóa học" });
    expect(link).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent("/courses/khoa-hoc-a")}`,
    );
  });

  it("signed out + FREE: Đăng ký ngay via login", () => {
    session = { user: null, status: "anonymous" };
    renderCta(free);
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng ký ngay" })).toHaveAttribute(
      "href",
      expect.stringContaining("/login?redirect="),
    );
  });

  it("shows a skeleton while the session or enrollment is loading (no flash of the wrong button)", async () => {
    session = { user: null, status: "loading" };
    const { unmount } = renderCta(paid);
    expect(
      screen.getByLabelText("Đang kiểm tra quyền truy cập"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Mua khóa học" }),
    ).not.toBeInTheDocument();
    unmount();
    session = {
      user: { id: "u1", roles: ["student"] },
      status: "authenticated",
    };
    core.api.mockReturnValue(new Promise(() => undefined));
    renderCta(paid);
    expect(
      screen.getByLabelText("Đang kiểm tra quyền truy cập"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mua khóa học" }),
    ).not.toBeInTheDocument();
  });

  it.each([paid, free])(
    "enrolled ($accessType): Vào học ngay, never a buy button",
    async (course) => {
      enrollment(true);
      renderCta(course);
      await settle();
      await settle();
      expect(
        screen.getByRole("link", { name: "Vào học ngay" }),
      ).toHaveAttribute("href", "/learn/khoa-hoc-a");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("enrolled and started: resumes at the last lesson", async () => {
    core.api.mockImplementation(async (path: string) =>
      path.endsWith("/enrollment-status")
        ? { isEnrolled: true }
        : {
            lessonSlug: "bai-2",
            lessonTitle: "Bài 2",
            lastPosition: 30,
            hasStarted: true,
          },
    );
    renderCta(paid);
    await settle();
    await settle();
    expect(
      screen.getByRole("link", { name: /Tiếp tục học \(Bài: Bài 2\)/ }),
    ).toHaveAttribute("href", "/learn/khoa-hoc-a/bai-2");
  });

  it("FREE: one click enrolls and opens the classroom", async () => {
    enrollment(false);
    pay.enrollFree.mockResolvedValue({
      message: "Enrolled successfully",
      enrollmentId: "e1",
    });
    renderCta(free);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Đăng ký học miễn phí" }),
    );
    await settle();
    expect(pay.enrollFree).toHaveBeenCalledWith("c1");
    expect(router.push).toHaveBeenCalledWith("/learn/khoa-hoc-a");
  });

  it("PAID: price + Mua khóa học creates the order and opens checkout", async () => {
    enrollment(false);
    pay.createOrder.mockResolvedValue({ code: "SHAN-20261007-X89K" });
    renderCta(paid);
    await settle();
    expect(screen.getByLabelText(/Giá 499\.000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mua khóa học" }));
    await settle();
    expect(pay.createOrder).toHaveBeenCalledWith(["c1"]);
    expect(router.push).toHaveBeenCalledWith("/checkout/SHAN-20261007-X89K");
  });

  it("PAID: a failed purchase explains why and stays on the page", async () => {
    enrollment(false);
    pay.createOrder.mockRejectedValue(
      new ApiError(429, ["TOO_MANY_PENDING_ORDERS"]),
    );
    renderCta(paid);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Mua khóa học" }));
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(/quá nhiều đơn/);
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mua khóa học" })).toBeEnabled();
  });

  it("blocks double clicks while the order is being created", async () => {
    enrollment(false);
    pay.createOrder.mockReturnValue(new Promise(() => undefined));
    renderCta(paid);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Mua khóa học" }));
    await settle();
    const busy = screen.getByRole("button", { name: /Đang tạo đơn hàng/ });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(pay.createOrder).toHaveBeenCalledTimes(1);
  });

  it("recovers when the enrollment check fails", async () => {
    core.api.mockRejectedValueOnce(new ApiError(500, ["x"]));
    renderCta(paid);
    await settle();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    enrollment(false);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await settle();
    expect(
      screen.getByRole("button", { name: "Mua khóa học" }),
    ).toBeInTheDocument();
  });

  it("staff without the student role can open the classroom", () => {
    session = {
      user: { id: "u2", roles: ["instructor"] },
      status: "authenticated",
    };
    renderCta(paid);
    expect(
      screen.getByRole("link", { name: "Vào học ngay" }),
    ).toBeInTheDocument();
  });
});

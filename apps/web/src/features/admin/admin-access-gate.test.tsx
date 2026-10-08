import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";

const router = { replace: vi.fn() };
let pathname = "/admin/orders";
let roles: Role[] = ["finance_officer"];
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({
    status: "authenticated",
    message: "",
    user: { id: "u1", roles },
    load: vi.fn(),
  }),
}));

import { AdminNavigation } from "@/components/layout/admin/admin-navigation";
import { AdminAccessGate } from "./admin-access-gate";

const renderGate = () =>
  render(
    <AdminAccessGate>
      <p>Nội dung quản trị</p>
    </AdminAccessGate>,
  );

describe("AdminAccessGate", () => {
  beforeEach(() => {
    router.replace.mockReset();
    pathname = "/admin/orders";
    roles = ["finance_officer"];
  });

  it("lets a finance officer into the order console", () => {
    renderGate();
    expect(screen.getByText("Nội dung quản trị")).toBeVisible();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps a finance officer out of the other admin pages", () => {
    pathname = "/admin/users";
    renderGate();
    expect(screen.queryByText("Nội dung quản trị")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/forbidden");
  });

  it("keeps everyone else out of the console", () => {
    roles = ["student", "instructor"];
    renderGate();
    expect(router.replace).toHaveBeenCalledWith("/forbidden");
  });

  it("still lets admins into every admin page", () => {
    roles = ["admin"];
    pathname = "/admin/users";
    renderGate();
    expect(screen.getByText("Nội dung quản trị")).toBeVisible();
  });
});

describe("AdminNavigation", () => {
  it("shows finance officers the Đơn hàng link and nothing else", () => {
    roles = ["finance_officer"];
    pathname = "/admin/orders";
    render(<AdminNavigation />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Đơn hàng"]);
    expect(links[0]).toHaveAttribute("href", "/admin/orders");
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("shows admins every module, orders included", () => {
    roles = ["admin"];
    pathname = "/admin";
    render(<AdminNavigation />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Trang quản trị", "Người dùng", "Đơn hàng", "Cài đặt hệ thống"],
    );
  });
});

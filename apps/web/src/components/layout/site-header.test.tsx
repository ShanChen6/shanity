import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";

let pathname = "/dashboard";
let user: { roles: Role[] } | null = null;
let status = "authenticated";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
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
  useSession: () => ({ user, status }),
}));
vi.mock("@/features/auth/user-menu", () => ({
  UserMenu: () => <div>user-menu</div>,
}));
vi.mock("@/features/command-menu/command-menu", () => ({
  CommandMenuTrigger: () => <button type="button">Tìm nhanh</button>,
}));
vi.mock("@/features/notifications/notification-bell", () => ({
  NotificationBell: () => <div>bell</div>,
}));
vi.mock("@/components/shared/theme-cycle-button", () => ({
  ThemeCycleButton: () => <button type="button">theme</button>,
}));

import { SiteHeader } from "./site-header";

const desktop = () =>
  screen.getByRole("navigation", { name: "Điều hướng chính" });

beforeEach(() => {
  pathname = "/dashboard";
  user = { roles: ["student"] };
  status = "authenticated";
});

describe("SiteHeader for a visitor", () => {
  beforeEach(() => {
    user = null;
    status = "anonymous";
  });

  it("offers browsing and sign-in, but no account widgets", () => {
    render(<SiteHeader />);
    expect(
      within(desktop())
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Khóa học", "Blog"]);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Tạo tài khoản" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.queryByText("bell")).toBeNull();
    expect(screen.queryByText("user-menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Tìm nhanh" }),
    ).toBeInTheDocument();
  });

  it("does not flash sign-in links while the session is still loading", () => {
    status = "loading";
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "Đăng nhập" })).toBeNull();
  });
});

describe("SiteHeader for a signed-in user", () => {
  it("keeps the bar to the main learner sections, plus bell and user menu", () => {
    render(<SiteHeader />);
    expect(
      within(desktop())
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Góc học tập", "Khóa học", "Lịch học", "Bài kiểm tra", "Blog"]);
    expect(screen.getByText("bell")).toBeInTheDocument();
    expect(screen.getByText("user-menu")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đăng nhập" })).toBeNull();
  });

  it("marks the current section, including pages nested under it", () => {
    pathname = "/courses/javascript";
    render(<SiteHeader />);
    const current = within(desktop())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["Khóa học"]);
  });

  it("keeps the quizzes section lit on attempt history", () => {
    pathname = "/quiz-attempts/abc";
    render(<SiteHeader />);
    expect(
      within(desktop()).getByRole("link", { name: "Bài kiểm tra" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("lights the learning space inside a course player", () => {
    pathname = "/learn/react/intro";
    render(<SiteHeader />);
    expect(
      within(desktop()).getByRole("link", { name: "Góc học tập" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("marks nothing on the home page", () => {
    pathname = "/";
    render(<SiteHeader />);
    expect(
      within(desktop())
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current")),
    ).toEqual([]);
  });
});

describe("mobile menu", () => {
  it("opens, lists the workspaces the roles allow, and closes on Escape", async () => {
    user = { roles: ["student", "instructor", "admin"] };
    render(<SiteHeader />);
    const toggle = screen.getByRole("button", { name: "Mở menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: /di động/ })).toBeNull();

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Đóng menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const mobile = screen.getByRole("navigation", { name: /di động/ });
    const labels = within(mobile)
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(labels).toContain("Không gian giảng viên");
    expect(labels).toContain("Trang quản trị");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: /di động/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Mở menu" })).toHaveFocus();
  });

  it("offers visitors a sign-up link in the panel", async () => {
    user = null;
    status = "anonymous";
    render(<SiteHeader />);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    const mobile = screen.getByRole("navigation", { name: /di động/ });
    expect(
      within(mobile).getByRole("link", { name: "Tạo tài khoản" }),
    ).toHaveAttribute("href", "/register");
  });

  it("offers no staff workspaces to a plain learner", async () => {
    render(<SiteHeader />);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    const mobile = screen.getByRole("navigation", { name: /di động/ });
    const labels = within(mobile)
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(labels).not.toContain("Không gian giảng viên");
    expect(labels).not.toContain("Trang quản trị");
  });
});

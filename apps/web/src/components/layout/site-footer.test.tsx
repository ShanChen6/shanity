import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/features/system-status/system-status-indicator", () => ({
  SystemStatusIndicator: () => <p>status-indicator</p>,
}));
const site = vi.hoisted(() => ({
  socialLinks: [] as Array<{ id: string; label: string; href: string }>,
  supportEmail: null as string | null,
  legalEntity: null as string | null,
  legalAddress: null as string | null,
  legalUpdated: "2026-10-08",
}));
vi.mock("@/config/site.config", () => ({ SITE: site }));

import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("lists the sitemap and legal pages, with the system status", () => {
    render(<SiteFooter />);
    const legal = screen.getByRole("navigation", { name: "Pháp lý" });
    expect(
      within(legal).getByRole("link", { name: "Điều khoản sử dụng" }),
    ).toHaveAttribute("href", "/legal/terms");
    expect(
      within(legal).getByRole("link", { name: "Chính sách bảo mật" }),
    ).toHaveAttribute("href", "/legal/privacy");
    expect(
      screen.getByRole("navigation", { name: "Khám phá" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Tham gia" }),
    ).toBeInTheDocument();
    expect(screen.getByText("status-indicator")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Shanity — trang chủ" }),
    ).toBeInTheDocument();
  });

  it("shows the current year and brand in the copyright line", () => {
    render(<SiteFooter />);
    expect(
      screen.getByText(
        new RegExp(
          `© ${new Date().getFullYear()} Shanity\\. Bảo lưu mọi quyền`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("invents nothing: no social, contact or entity until configured", () => {
    render(<SiteFooter />);
    expect(screen.queryByRole("list", { name: "Mạng xã hội" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Liên hệ hỗ trợ" })).toBeNull();
  });

  it("shows configured social links safely, plus support and legal entity", () => {
    site.socialLinks = [
      { id: "youtube", label: "YouTube", href: "https://youtube.com/@shanity" },
    ];
    site.supportEmail = "help@shanity.dev";
    site.legalEntity = "Công ty TNHH Shanity";
    site.legalAddress = "1 Đường Học Tập, Hà Nội";
    render(<SiteFooter />);
    const social = screen.getByRole("list", { name: "Mạng xã hội" });
    const link = within(social).getByRole("link", { name: /YouTube/ });
    expect(link).toHaveAttribute("href", "https://youtube.com/@shanity");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("link", { name: "Liên hệ hỗ trợ" }),
    ).toHaveAttribute("href", "mailto:help@shanity.dev");
    expect(screen.getByText(/Công ty TNHH Shanity/)).toBeInTheDocument();
    expect(screen.getByText(/1 Đường Học Tập, Hà Nội/)).toBeInTheDocument();
  });
});

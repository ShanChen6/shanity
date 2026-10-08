import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/courses/js";
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

import {
  BreadcrumbLabel,
  BreadcrumbProvider,
  Breadcrumbs,
} from "./breadcrumbs";

const names = () =>
  screen
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace("/", "").trim());

describe("Breadcrumbs", () => {
  it("renders a labelled trail with links, a current page and a root", () => {
    pathname = "/courses/js";
    render(<Breadcrumbs root={{ label: "Trang chủ", href: "/" }} />);
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
    expect(names()).toEqual(["Trang chủ", "Khóa học", "Chi tiết khóa học"]);
    expect(screen.getByRole("link", { name: "Trang chủ" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Khóa học" })).toHaveAttribute(
      "href",
      "/courses",
    );
    const current = screen.getByText("Chi tiết khóa học");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });

  it("does not link a level without a page", () => {
    pathname = "/instructor/courses/abc/edit/basic";
    render(<Breadcrumbs />);
    expect(
      screen.queryByRole("link", { name: "Chi tiết khóa học" }),
    ).toBeNull();
    expect(screen.getByText("Chi tiết khóa học")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chỉnh sửa" })).toHaveAttribute(
      "href",
      "/instructor/courses/abc/edit",
    );
  });

  it("hides a lone crumb unless asked to keep it", () => {
    pathname = "/admin";
    const { container, rerender } = render(<Breadcrumbs />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Breadcrumbs alwaysShow />);
    expect(screen.getByText("Quản trị")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a page's own title once it registers one", async () => {
    pathname = "/courses/js";
    render(
      <BreadcrumbProvider>
        <Breadcrumbs root={{ label: "Trang chủ", href: "/" }} />
        <BreadcrumbLabel href="/courses/js" label="JavaScript cơ bản" />
      </BreadcrumbProvider>,
    );
    expect(await screen.findByText("JavaScript cơ bản")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("accepts a ready-made trail", () => {
    pathname = "/anything";
    render(
      <Breadcrumbs
        items={[
          { href: "/a", label: "A", current: false, linkable: true },
          { href: "/b", label: "B", current: true, linkable: false },
        ]}
      />,
    );
    expect(names()).toEqual(["A", "B"]);
  });
});

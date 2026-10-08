import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./brand-logo";

const images = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img"));

describe("BrandLogo", () => {
  it("renders both wordmarks for the full logo and swaps them with CSS only", () => {
    const { container } = render(<BrandLogo />);
    const [light, dark] = images(container);
    expect(decodeURIComponent(light!.getAttribute("src") ?? "")).toContain(
      "logo-full-light.png",
    );
    expect(decodeURIComponent(dark!.getAttribute("src") ?? "")).toContain(
      "logo-full-dark.png",
    );
    // `dark:` utilities follow the .dark class the theme provider sets.
    expect(light).toHaveClass("dark:hidden");
    expect(dark).toHaveClass("hidden", "dark:block");
  });

  it("links home with an accessible name and a decorative image", () => {
    const { container } = render(<BrandLogo />);
    const link = screen.getByRole("link", { name: "Shanity — trang chủ" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("min-h-11");
    for (const image of images(container))
      expect(image).toHaveAttribute("alt", "");
  });

  it("accepts another destination and accessible name", () => {
    render(<BrandLogo href="/admin/login" label="Shanity Admin" />);
    expect(screen.getByRole("link", { name: "Shanity Admin" })).toHaveAttribute(
      "href",
      "/admin/login",
    );
  });

  it("derives the missing dimension from the logo's aspect ratio", () => {
    const { container, rerender } = render(<BrandLogo width={300} />);
    expect(images(container)[0]).toHaveAttribute("width", "300");
    expect(images(container)[0]).toHaveAttribute("height", "100");
    rerender(<BrandLogo height={50} />);
    expect(images(container)[0]).toHaveAttribute("width", "150");
    rerender(<BrandLogo width={120} height={44} />);
    expect(images(container)[0]).toHaveAttribute("height", "44");
  });

  it("renders the icon variant as a single square image", () => {
    const { container } = render(<BrandLogo variant="icon" width={48} />);
    const [only, ...rest] = images(container);
    expect(rest).toHaveLength(0);
    expect(decodeURIComponent(only!.getAttribute("src") ?? "")).toContain(
      "logo-icon.png",
    );
    expect(only).toHaveAttribute("width", "48");
    expect(only).toHaveAttribute("height", "48");
  });

  it("paints the monochrome variant with the current text colour", () => {
    const { container } = render(
      <BrandLogo
        variant="monochrome"
        width={150}
        href={null}
        className="text-primary"
      />,
    );
    expect(images(container)).toHaveLength(0);
    const mark = screen.getByRole("img", { name: "Shanity" });
    expect(mark).toHaveClass("brand-mask");
    expect(mark.style.getPropertyValue("--brand-mask-image")).toContain(
      "logo-full-light.png",
    );
    expect(mark.parentElement).toHaveClass("text-primary");
  });

  it("names the bare logo for assistive tech but not when a link already does", () => {
    const { container, rerender } = render(<BrandLogo href={null} />);
    expect(images(container)[0]).toHaveAttribute("alt", "Shanity");
    rerender(<BrandLogo variant="monochrome" />);
    expect(screen.queryByRole("img", { name: "Shanity" })).toBeNull();
  });

  it("raises fetch priority without preloading both themes", () => {
    const { container } = render(<BrandLogo highPriority />);
    for (const image of images(container)) {
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(image).not.toHaveAttribute("loading", "eager");
    }
  });
});

describe("BrandLogo surface", () => {
  it("renders only the white wordmark on a permanently dark surface", () => {
    const { container } = render(<BrandLogo surface="dark" />);
    const found = images(container);
    expect(found).toHaveLength(1);
    expect(decodeURIComponent(found[0]!.getAttribute("src") ?? "")).toContain(
      "logo-full-dark.png",
    );
    expect(found[0]).not.toHaveClass("hidden");
  });

  it("renders only the dark wordmark on a permanently light surface", () => {
    const { container } = render(<BrandLogo surface="light" />);
    const found = images(container);
    expect(found).toHaveLength(1);
    expect(decodeURIComponent(found[0]!.getAttribute("src") ?? "")).toContain(
      "logo-full-light.png",
    );
    expect(found[0]).not.toHaveClass("dark:hidden");
  });
});

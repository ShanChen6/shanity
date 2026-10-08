import Image from "next/image";
import Link from "next/link";
import { BRAND, BRAND_ASPECT, type BrandVariant } from "@/config/brand.config";

const DEFAULT_WIDTH: Record<BrandVariant, number> = {
  full: 120,
  monochrome: 120,
  icon: 36,
};

export type BrandLogoProps = {
  /**
   * - `full`: icon + wordmark; swaps to the white wordmark in Dark Mode.
   * - `icon`: the "S" mark only (collapsed sidebars, avatars, app icon).
   * - `monochrome`: the full logo painted in the surrounding text colour,
   *   for one-colour contexts such as banners and print.
   */
  variant?: BrandVariant;
  /** Give one dimension and the other follows the logo's aspect ratio. */
  width?: number;
  height?: number;
  /** Wrap in a link to this path; `null` renders the bare logo. */
  href?: string | null;
  /**
   * `auto` follows the theme. Force `dark` or `light` when the logo sits on a
   * surface that ignores the theme (a permanently dark sidebar): the name is
   * the background it is read on.
   */
  surface?: "auto" | "light" | "dark";
  /** Accessible name of the link when it does not lead home. */
  label?: string;
  /** Above-the-fold logo: raises fetch priority without preloading both themes. */
  highPriority?: boolean;
  className?: string;
};

function dimensions(
  variant: BrandVariant,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const ratio = BRAND_ASPECT[variant];
  if (width && height) return { width, height };
  if (width) return { width, height: Math.round(width / ratio) };
  if (height) return { width: Math.round(height * ratio), height };
  const fallback = DEFAULT_WIDTH[variant];
  return { width: fallback, height: Math.round(fallback / ratio) };
}

/**
 * The Shanity logo. Theme switching is pure CSS (`dark:` utilities follow the
 * `.dark` class the theme provider sets), so there is no hydration flash and
 * the browser only downloads the variant that is actually visible.
 */
export function BrandLogo({
  variant = "full",
  width,
  height,
  href = "/",
  label,
  surface = "auto",
  highPriority = false,
  className = "",
}: BrandLogoProps) {
  const size = dimensions(variant, width, height);
  // Inside a labelled link the image is decorative; alone it names the brand.
  const alt = href === null ? BRAND.name : "";
  const fetchPriority = highPriority ? "high" : undefined;

  const logo =
    variant === "monochrome" ? (
      <span
        role={href === null ? "img" : undefined}
        aria-label={href === null ? BRAND.name : undefined}
        aria-hidden={href === null ? undefined : true}
        className="brand-mask inline-block shrink-0"
        style={{
          width: size.width,
          height: size.height,
          ["--brand-mask-image" as string]: `url(${BRAND.assets.fullLight.src})`,
        }}
      />
    ) : variant === "icon" ? (
      <Image
        src={BRAND.assets.icon.src}
        alt={alt}
        {...size}
        fetchPriority={fetchPriority}
        className="shrink-0"
      />
    ) : (
      <>
        {surface !== "dark" && (
          <Image
            src={BRAND.assets.fullLight.src}
            alt={alt}
            {...size}
            fetchPriority={fetchPriority}
            className={surface === "auto" ? "shrink-0 dark:hidden" : "shrink-0"}
          />
        )}
        {surface !== "light" && (
          <Image
            src={BRAND.assets.fullDark.src}
            alt={alt}
            {...size}
            fetchPriority={fetchPriority}
            className={
              surface === "auto" ? "hidden shrink-0 dark:block" : "shrink-0"
            }
          />
        )}
      </>
    );

  if (href === null)
    return <span className={`inline-flex ${className}`}>{logo}</span>;
  return (
    <Link
      href={href}
      aria-label={label ?? `${BRAND.name} — trang chủ`}
      // 44px keeps the touch target accessible even for a small logo.
      className={`inline-flex min-h-11 items-center rounded-md ${className}`}
    >
      {logo}
    </Link>
  );
}

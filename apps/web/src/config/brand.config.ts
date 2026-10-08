/**
 * Single source of truth for the Shanity brand. Every logo, icon and theme
 * colour in the app (header, footer, auth screens, favicon, PWA manifest)
 * reads from here, so a re-brand is a file swap in public/assets/branding/
 * plus this table.
 */
const ASSET_DIR = "/assets/branding";

export const BRAND = {
  name: "Shanity",
  tagline: "Học mỗi ngày",
  description: "Không gian học tập dành cho học sinh.",
  assets: {
    // Wordmark in dark teal: for light surfaces.
    fullLight: {
      src: `${ASSET_DIR}/logo-full-light.png`,
      width: 2172,
      height: 724,
    },
    // Wordmark in white: for dark surfaces.
    fullDark: {
      src: `${ASSET_DIR}/logo-full-dark.png`,
      width: 2172,
      height: 724,
    },
    // The "S" mark alone; reads on both themes.
    icon: { src: `${ASSET_DIR}/logo-icon.png`, width: 1254, height: 1254 },
    favicon: `${ASSET_DIR}/favicon.ico`,
    favicon16: `${ASSET_DIR}/favicon-16x16.png`,
    favicon32: `${ASSET_DIR}/favicon-32x32.png`,
    appleTouchIcon: `${ASSET_DIR}/apple-touch-icon.png`,
    androidChrome192: `${ASSET_DIR}/android-chrome-192x192.png`,
    androidChrome512: `${ASSET_DIR}/android-chrome-512x512.png`,
  },
  // Browser UI colours. Kept in step with --background in styles/theme.css;
  // brand.config.test.ts fails if they drift.
  themeColor: { light: "#f8fafd", dark: "#0b1017" },
} as const;

export type BrandVariant = "full" | "icon" | "monochrome";

/** Width / height of each variant, derived from the real asset sizes. */
export const BRAND_ASPECT: Record<BrandVariant, number> = {
  full: BRAND.assets.fullLight.width / BRAND.assets.fullLight.height,
  monochrome: BRAND.assets.fullLight.width / BRAND.assets.fullLight.height,
  icon: BRAND.assets.icon.width / BRAND.assets.icon.height,
};

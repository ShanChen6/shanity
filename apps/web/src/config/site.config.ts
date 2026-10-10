/**
 * Public site facts that are deployment-specific. Nothing here is invented:
 * a social profile, support address or legal entity appears in the footer only
 * when its NEXT_PUBLIC_* variable is set (see .env.example).
 */

/** Only absolute https URLs: a typo or a hostile env value cannot inject `javascript:`. */
export function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const SOCIAL_CANDIDATES = [
  {
    id: "facebook",
    label: "Facebook",
    url: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
  },
  {
    id: "youtube",
    label: "YouTube",
    url: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
  },
  { id: "tiktok", label: "TikTok", url: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
  {
    id: "linkedin",
    label: "LinkedIn",
    url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
  },
  { id: "github", label: "GitHub", url: process.env.NEXT_PUBLIC_SOCIAL_GITHUB },
] as const;

export type SocialLink = { id: string; label: string; href: string };

export function resolveSocialLinks(
  candidates: ReadonlyArray<{
    id: string;
    label: string;
    url: string | undefined;
  }>,
): SocialLink[] {
  return candidates.flatMap(({ id, label, url }) => {
    const href = safeExternalUrl(url);
    return href ? [{ id, label, href }] : [];
  });
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export const SITE = {
  socialLinks: resolveSocialLinks(SOCIAL_CANDIDATES),
  // A bare address only; anything else (spaces, a URL) is dropped.
  supportEmail:
    supportEmail && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)
      ? supportEmail
      : null,
  legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || null,
  legalAddress: process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || null,
  /** When the legal pages were last reviewed against the product. */
  legalUpdated: "2026-10-08",
} as const;

/**
 * The site's public origin, for absolute URLs in sitemaps, canonical links,
 * Open Graph and structured data. Must be http(s) with no path; anything
 * else falls back to the local dev server.
 */
export function resolveSiteUrl(value: string | undefined): string {
  try {
    const url = new URL((value ?? "").trim());
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.pathname === "/" &&
      !url.search &&
      !url.username
    )
      return url.origin;
  } catch {
    // fall through
  }
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** An absolute URL on this site. */
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString();

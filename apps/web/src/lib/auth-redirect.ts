// Shared by server routing and browser navigation. Never accept an external URL.
export function safeRedirect(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20\x7f]/.test(value)
  )
    return "/profile";
  try {
    const url = new URL(value, "https://shanity.invalid");
    let path = url.pathname;
    // Check encoded separators and auth routes too; don't decode the returned URL.
    for (let i = 0; i < 5; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
      if (i === 4) return "/profile";
    }
    if (
      url.origin !== "https://shanity.invalid" ||
      path.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(path)
    )
      return "/profile";
    path = new URL(path, "https://shanity.invalid").pathname;
    if (/^\/(?:login|register|auth|api|_next)(?:\/|$)/.test(path))
      return "/profile";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/profile";
  }
}
export function loginUrl(destination: string) {
  return `/login?${new URLSearchParams({ redirect: safeRedirect(destination) })}`;
}
export const GOOGLE_RETURN_KEY = "shanity-google-return";

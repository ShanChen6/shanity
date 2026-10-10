import { API_URL } from "@/lib/api";

const UPLOADED = /^\/blog-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Posts store their uploaded images as `/blog-images/<id>`, a path on the
 * API, never with a host: the host is added here, from the current
 * NEXT_PUBLIC_API_URL, each time the post is shown. Moving the API or the
 * site to another domain then needs only that variable, not a rewrite of
 * every post. Absolute links to an uploaded image on any host (written
 * before posts stored paths) are re-pointed the same way. Other images are
 * left as the author wrote them.
 */
export function blogImageUrl(source: string): string {
  const value = source.trim();
  if (UPLOADED.test(value)) return `${API_URL}${value}`;
  try {
    const url = new URL(value);
    if (/^https?:$/.test(url.protocol) && UPLOADED.test(url.pathname) && !url.search)
      return `${API_URL}${url.pathname}`;
  } catch {
    // Not an absolute URL: leave it alone.
  }
  return value;
}

/** Whether a stored image is one of ours (`/blog-images/<id>`). */
export const isUploadedImage = (source: string) => UPLOADED.test(source.trim());

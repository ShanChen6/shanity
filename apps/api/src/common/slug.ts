/** Longest slug the blog accepts (CHK_posts_slug). */
export const SLUG_MAX_LENGTH = 200;

/** Lowercase ASCII words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A URL slug from Vietnamese (or any Latin) text: "Đường đi của Hàm" ->
 * "duong-di-cua-ham". NFKD strips the tone marks but leaves đ/Đ, which is
 * a letter of its own, so it is mapped first.
 */
export function slugify(text: string, fallback = 'bai-viet') {
  const slug = text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

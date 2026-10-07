const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// SHAN-YYYYMMDD-XXXX, or a pre-PAY3 code (SHAN + alphanumerics).
const CODE = /^SHAN(?:-\d{8}-[A-Z0-9]{4}|[A-Z0-9]{4,12})$/i;

export type OrderLookup = { id: string } | { code: string };

/**
 * Orders are addressed by UUID (internal) or by the buyer-facing code (URLs,
 * support). Returns null for anything else so callers answer 404 instead of
 * letting PostgreSQL fail a uuid cast with a 500.
 */
export function orderLookup(ref: string): OrderLookup | null {
  if (UUID.test(ref)) return { id: ref.toLowerCase() };
  if (CODE.test(ref)) return { code: ref.toUpperCase() };
  return null;
}

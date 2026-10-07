/** HTTP seam for gateways that call a REST API; tests inject a stub. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const PAYMENT_HTTP_FETCH = Symbol('PAYMENT_HTTP_FETCH');

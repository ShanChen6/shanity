import { api, API_URL } from "@/lib/api";
import type {
  AdminOrderDetail,
  AdminOrderList,
  ProofUpload,
  ReconcileRequest,
  ReconcileResult,
  RefundRequest,
  RefundResult,
} from "./types";

// The console reads and runs two audited workflows. There is deliberately no
// call that sets an order's status: the API has no such route either.
const base = "/api/v1/admin/orders";
const enc = encodeURIComponent;

export const fetchAdminOrders = (query: string, signal?: AbortSignal) =>
  api<AdminOrderList>(`${base}?${query}`, { signal });

/** The API records every detail view in the audit trail, so call it sparingly. */
export const fetchAdminOrder = (id: string) =>
  api<AdminOrderDetail>(`${base}/${enc(id)}`);

export const reconcileOrder = (id: string, body: ReconcileRequest) =>
  api<ReconcileResult>(`${base}/${enc(id)}/reconcile`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const refundOrder = (id: string, body: RefundRequest) =>
  api<RefundResult>(`${base}/${enc(id)}/refund`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// FormData: api() leaves Content-Type to the browser so the boundary is set.
export const uploadProof = (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<ProofUpload>(`${base}/${enc(id)}/proofs`, {
    method: "POST",
    body: form,
  });
};

/**
 * Proofs are served by the API origin with the session cookie, and every read
 * is audited, so they open in a new tab on demand instead of an eager <img>.
 */
export function proofHref(proofImageUrl: string): string | null {
  if (proofImageUrl.startsWith(`${base}/`)) return `${API_URL}${proofImageUrl}`;
  try {
    const url = new URL(proofImageUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

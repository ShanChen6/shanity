import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "@/lib/api";
import {
  fetchAdminOrder,
  fetchAdminOrders,
  proofHref,
  reconcileOrder,
  refundOrder,
  uploadProof,
} from "./api";

type Call = { url: string; init: RequestInit };
let calls: Call[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const headersOf = (call: Call) =>
  Object.fromEntries(new Headers(call.init.headers as HeadersInit));

describe("admin orders api", () => {
  it("reads with GET, never carrying a body", async () => {
    await fetchAdminOrders("page=2&limit=20");
    await fetchAdminOrder("order id/1");
    expect(calls[0].url).toBe(`${API_URL}/api/v1/admin/orders?page=2&limit=20`);
    expect(calls[1].url).toBe(`${API_URL}/api/v1/admin/orders/order%20id%2F1`);
    for (const call of calls) {
      expect(call.init.method ?? "GET").toBe("GET");
      expect(call.init.body).toBeUndefined();
      expect(call.init.credentials).toBe("include");
    }
  });

  it("posts the two workflows as JSON", async () => {
    await reconcileOrder("o1", {
      providerTransactionId: "FT123456",
      amountReceived: 499000,
      provider: "VIETQR",
      note: "Khách đã chuyển khoản",
      proofImageUrl: "/api/v1/admin/orders/o1/proofs/a.png",
    });
    await refundOrder("o1", {
      refundAmount: 100000,
      reason: "Học viên yêu cầu hoàn tiền",
      notifyStudent: true,
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${API_URL}/api/v1/admin/orders/o1/reconcile`,
      `${API_URL}/api/v1/admin/orders/o1/refund`,
    ]);
    for (const call of calls) {
      expect(call.init.method).toBe("POST");
      expect(headersOf(call)["content-type"]).toBe("application/json");
    }
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      refundAmount: 100000,
      reason: "Học viên yêu cầu hoàn tiền",
      notifyStudent: true,
    });
  });

  it("uploads a proof as multipart without forcing a content type", async () => {
    const file = new File(["png"], "sao-ke.png", { type: "image/png" });
    await uploadProof("o1", file);
    const [call] = calls;
    expect(call.url).toBe(`${API_URL}/api/v1/admin/orders/o1/proofs`);
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBeInstanceOf(FormData);
    expect((call.init.body as FormData).get("file")).toBe(file);
    expect(headersOf(call)["content-type"]).toBeUndefined();
  });

  it("opens proofs on the API origin, or an https link, and nothing else", () => {
    expect(proofHref("/api/v1/admin/orders/o1/proofs/a.png")).toBe(
      `${API_URL}/api/v1/admin/orders/o1/proofs/a.png`,
    );
    expect(proofHref("https://bank.example/receipt/1")).toBe(
      "https://bank.example/receipt/1",
    );
    expect(proofHref("javascript:alert(1)")).toBeNull();
    expect(proofHref("http://bank.example/receipt")).toBeNull();
    expect(proofHref("/somewhere/else")).toBeNull();
  });
});

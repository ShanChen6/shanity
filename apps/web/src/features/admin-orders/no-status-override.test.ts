import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The API has no route that sets an order's status, so the console must not
// grow one on the UI side either: reads (GET) and the two audited POSTs only.
const dir = import.meta.dirname;
const pageDir = join(dir, "../../app/(protected)/admin/orders");
const isSource = (name: string) =>
  /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name);
const sources = [
  ...readdirSync(dir)
    .filter(isSource)
    .map((name) => join(dir, name)),
  ...readdirSync(pageDir)
    .filter(isSource)
    .map((name) => join(pageDir, name)),
].map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("no direct order status override", () => {
  it("scans the feature and its page", () => {
    const names = sources.map((source) => source.path);
    expect(names.some((name) => name.endsWith("api.ts"))).toBe(true);
    expect(names.some((name) => name.endsWith("orders-view.tsx"))).toBe(true);
    expect(names.some((name) => name.endsWith("page.tsx"))).toBe(true);
  });

  it("api.ts only reads (GET) or POSTs the audited workflows", () => {
    const api = sources.find((source) => source.path.endsWith("/api.ts"))!;
    const methods = [...api.text.matchAll(/method:\s*["'`]([A-Za-z]+)["'`]/g)];
    expect(methods.length).toBeGreaterThan(0);
    for (const [, method] of methods) expect(method).toBe("POST");
    const posts = [...api.text.matchAll(/\$\{enc\(id\)\}\/(\w+)/g)].map(
      (match) => match[1],
    );
    expect(new Set(posts)).toEqual(new Set(["reconcile", "refund", "proofs"]));
    expect(api.text).not.toMatch(/\/status\b/);
  });

  it("no code uses PATCH, PUT or DELETE", () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toMatch(
        /method:\s*["'`](?:PATCH|PUT|DELETE)["'`]/i,
      );
      expect(text, path).not.toMatch(/\.(?:patch|put|delete)\s*\(/);
    }
  });

  it("no order-status setter or 'mark as paid' control exists", () => {
    const setter =
      /\b(?:set|update|change|override|force|mark)[A-Za-z]*(?:Status|AsPaid|Paid|Completed)\b/;
    const copy = /Đánh dấu|Đổi trạng thái|Cập nhật trạng thái/;
    for (const { path, text } of sources) {
      expect(text, path).not.toMatch(setter);
      expect(text, path).not.toMatch(copy);
    }
  });
});

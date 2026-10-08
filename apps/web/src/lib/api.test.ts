import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, apiPage } from "./api";

type Reply = { status?: number; body?: unknown; headers?: HeadersInit };
const calls: string[] = [];

function reply(...replies: Reply[]) {
  calls.length = 0;
  const queue = [...replies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const next = queue.shift() ?? { status: 500 };
      return new Response(
        next.status === 204 ? null : JSON.stringify(next.body ?? {}),
        { status: next.status ?? 200, headers: next.headers },
      );
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

const envelope = (over: Record<string, unknown> = {}) => ({
  success: true,
  statusCode: 200,
  message: "OK",
  data: null,
  ...over,
});
const meta = { page: 2, limit: 5, total: 11, totalPages: 3 };

describe("api()", () => {
  it("returns the body of a legacy route as is", async () => {
    reply({ body: { id: "c1", title: "JS" } });
    await expect(api("/courses/c1")).resolves.toEqual({
      id: "c1",
      title: "JS",
    });
  });

  it("unwraps the data of a standard envelope", async () => {
    reply({ body: envelope({ data: { id: "c1" } }) });
    await expect(api("/api/v1/student/courses/c1")).resolves.toEqual({
      id: "c1",
    });
  });

  it("does not mistake a payload that merely has a data field for an envelope", async () => {
    reply({ body: { data: [1, 2], total: 2 } });
    await expect(api("/public/courses")).resolves.toEqual({
      data: [1, 2],
      total: 2,
    });
  });

  it("returns undefined for 204", async () => {
    reply({ status: 204 });
    await expect(api("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

describe("apiPage()", () => {
  it("returns the rows and the pagination of the envelope", async () => {
    reply({ body: envelope({ data: [{ id: 1 }, { id: 2 }], meta }) });
    await expect(apiPage("/api/v1/public/courses")).resolves.toEqual({
      data: [{ id: 1 }, { id: 2 }],
      meta,
    });
  });

  it.each([
    ["a legacy body", { data: [], total: 0 }],
    ["an envelope without meta", envelope({ data: [] })],
    ["an envelope whose data is not a list", envelope({ data: {}, meta })],
  ])("rejects %s instead of guessing", async (_name, body) => {
    reply({ body });
    await expect(apiPage("/x")).rejects.toMatchObject({ status: 502 });
  });
});

describe("errors", () => {
  it("reads messages, details and the correlation id of an error envelope", async () => {
    reply({
      status: 403,
      headers: { "x-correlation-id": "req-abc12345" },
      body: envelope({
        success: false,
        statusCode: 403,
        message: "Không đủ quyền.",
        errors: ["Bạn chưa hoàn thành bài trước."],
        data: {
          code: "PREREQUISITE_LESSON_NOT_COMPLETED",
          requiredLesson: "l1",
        },
      }),
    });
    const error = await api("/api/v1/student/lessons/l2").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      messages: ["Bạn chưa hoàn thành bài trước."],
      code: "PREREQUISITE_LESSON_NOT_COMPLETED",
      correlationId: "req-abc12345",
    });
  });

  it("falls back to the envelope message when there are no field errors", async () => {
    reply({
      status: 404,
      body: envelope({
        success: false,
        statusCode: 404,
        message: "Không tìm thấy khóa học.",
        data: null,
      }),
    });
    await expect(api("/api/v1/student/courses/x")).rejects.toMatchObject({
      messages: ["Không tìm thấy khóa học."],
      data: {},
    });
  });

  it("keeps reading a legacy error body, array messages included", async () => {
    reply({
      status: 400,
      headers: { "x-correlation-id": "req-legacy01" },
      body: { message: ["email must be an email"], code: "VALIDATION" },
    });
    await expect(
      api("/auth/register", { method: "POST" }),
    ).rejects.toMatchObject({
      status: 400,
      messages: ["email must be an email"],
      code: "VALIDATION",
      correlationId: "req-legacy01",
    });
  });

  it("uses a generic message when the error has no usable body", async () => {
    reply({ status: 500 });
    await expect(api("/x")).rejects.toMatchObject({
      status: 500,
      messages: ["Yêu cầu không thành công."],
    });
  });
});

describe("401 handling", () => {
  const unauthorized = { status: 401, body: { message: "Unauthorized" } };

  it("refreshes the session once, then retries and unwraps the envelope", async () => {
    reply(
      unauthorized, // the request itself
      unauthorized, // probe: nobody refreshed meanwhile
      { body: {} }, // POST /auth/refresh
      { body: envelope({ data: { ok: true } }) }, // the retry
    );
    await expect(api("/api/v1/student/courses")).resolves.toEqual({ ok: true });
    expect(
      calls.map((url) => url.replace("http://localhost:4000", "")),
    ).toEqual([
      "/api/v1/student/courses",
      "/users/me",
      "/auth/refresh",
      "/api/v1/student/courses",
    ]);
  });

  it("skips the refresh when another tab already renewed the session", async () => {
    reply(unauthorized, { body: {} }, { body: envelope({ data: 1 }) });
    await expect(api("/api/v1/student/courses")).resolves.toBe(1);
    expect(calls).toHaveLength(3);
    expect(calls.some((url) => url.includes("/auth/refresh"))).toBe(false);
  });

  it("does not refresh for public calls", async () => {
    reply(unauthorized);
    await expect(api("/public/x", {}, false)).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
  });
});

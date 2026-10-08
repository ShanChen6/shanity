import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemStatusIndicator } from "./system-status-indicator";
import { useSystemStatus } from "./use-system-status";

function wrap(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });

let health: () => Response | Promise<Response>;
beforeEach(() => {
  setOnline(true);
  health = () =>
    new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      expect(String(url)).toMatch(/\/health\/db$/);
      return health();
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe("SystemStatusIndicator", () => {
  it("starts as checking, then reports normal operation", async () => {
    wrap(<SystemStatusIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đang kiểm tra hệ thống",
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Hệ thống hoạt động bình thường",
      ),
    );
  });

  it("reports a degraded system when the health check fails", async () => {
    health = () => new Response("{}", { status: 503 });
    wrap(<SystemStatusIndicator />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Hệ thống đang gặp sự cố",
      ),
    );
  });

  it("reports a network failure the same way", async () => {
    health = () => {
      throw new TypeError("fetch failed");
    };
    wrap(<SystemStatusIndicator />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Hệ thống đang gặp sự cố",
      ),
    );
  });

  it("says the user is offline and does not call the API", () => {
    setOnline(false);
    wrap(<SystemStatusIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Bạn đang ngoại tuyến",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is announced politely and never relies on colour alone", async () => {
    wrap(<SystemStatusIndicator />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});

function Probe() {
  const { state, checkedAt, refetch } = useSystemStatus();
  return (
    <div>
      <p data-testid="state">{state}</p>
      <p data-testid="checked">{checkedAt ? "yes" : "no"}</p>
      <button type="button" onClick={refetch}>
        again
      </button>
    </div>
  );
}

describe("useSystemStatus", () => {
  it("exposes when it last checked and can re-check on demand", async () => {
    wrap(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("operational"),
    );
    expect(screen.getByTestId("checked")).toHaveTextContent("yes");
    const calls = vi.mocked(fetch).mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "again" }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 1),
    );
  });

  it("recovers once the API answers again", async () => {
    health = () => new Response("{}", { status: 503 });
    wrap(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("degraded"),
    );
    health = () => new Response("{}", { status: 200 });
    await userEvent.click(screen.getByRole("button", { name: "again" }));
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("operational"),
    );
  });
});

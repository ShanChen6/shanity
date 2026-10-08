import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DURATION,
  MAX_VISIBLE_TOASTS,
  ToastProvider,
  useToast,
} from "./toast-provider";

type Toasts = ReturnType<typeof useToast>;
// Filled from an effect, so no component assigns module state while rendering.
const captured: { api?: Toasts } = {};
const api = () => captured.api!;
function Grab() {
  const toasts = useToast();
  useEffect(() => {
    captured.api = toasts;
  }, [toasts]);
  return null;
}
const mount = () =>
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );
const show = (...args: Parameters<Toasts["toast"]>) =>
  act(() => {
    api().toast(...args);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ToastProvider", () => {
  it("announces errors as alerts and everything else as status", () => {
    mount();
    show("Lưu thất bại", { tone: "error" });
    show("Đã lưu", { tone: "success" });
    expect(screen.getByRole("alert")).toHaveTextContent("Lưu thất bại");
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
  });

  it("exposes success and error shortcuts", () => {
    mount();
    act(() => {
      api().success("ok");
      api().error("bad");
    });
    expect(screen.getByRole("status")).toHaveTextContent("ok");
    expect(screen.getByRole("alert")).toHaveTextContent("bad");
  });

  it("disappears after its duration, errors lasting longer than successes", () => {
    mount();
    show("done", { tone: "success" });
    show("oops", { tone: "error" });
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.success + 1));
    expect(screen.queryByText("done")).toBeNull();
    expect(screen.getByText("oops")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.error));
    expect(screen.queryByText("oops")).toBeNull();
  });

  it("honours an explicit duration", () => {
    mount();
    show("brief", { duration: 500 });
    act(() => void vi.advanceTimersByTime(501));
    expect(screen.queryByText("brief")).toBeNull();
  });

  it("merges an identical message and restarts its timer", () => {
    mount();
    show("again", { tone: "error" });
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.error - 1000));
    show("again", { tone: "error" });
    expect(screen.getAllByText("again")).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.error - 1000));
    expect(screen.getByText("again")).toBeInTheDocument();
  });

  it("treats the same explicit id as the same toast", () => {
    mount();
    show("first text", { id: "save" });
    show("second text", { id: "save" });
    expect(screen.queryByText("first text")).toBeNull();
    expect(screen.getByText("second text")).toBeInTheDocument();
  });

  it("keeps only the newest few", () => {
    mount();
    for (let i = 1; i <= MAX_VISIBLE_TOASTS + 2; i++) show(`toast ${i}`);
    expect(screen.getAllByRole("status")).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(screen.queryByText("toast 1")).toBeNull();
    expect(
      screen.getByText(`toast ${MAX_VISIBLE_TOASTS + 2}`),
    ).toBeInTheDocument();
  });

  it("can be dismissed by hand, by button or by id", async () => {
    vi.useRealTimers();
    mount();
    show("close me");
    await userEvent.click(
      screen.getByRole("button", { name: "Đóng thông báo" }),
    );
    expect(screen.queryByText("close me")).toBeNull();
    let id = "";
    act(() => {
      id = api().toast("by id");
    });
    act(() => api().dismiss(id));
    expect(screen.queryByText("by id")).toBeNull();
  });

  it("pauses while hovered or focused so it can be read", async () => {
    mount();
    show("read me", { tone: "error" });
    const toast = screen.getByRole("alert");
    act(() => {
      toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      toast.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    });
    // React's onMouseEnter is simulated through mouseover; assert behaviourally.
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.error * 3));
    expect(screen.queryByText("read me")).not.toBeNull();
    act(() => {
      toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    act(() => void vi.advanceTimersByTime(DEFAULT_DURATION.error + 1));
    expect(screen.queryByText("read me")).toBeNull();
  });

  it("labels the stack for assistive technology", () => {
    mount();
    expect(
      screen.getByRole("region", { name: "Thông báo" }),
    ).toBeInTheDocument();
  });

  it("refuses to be used without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Grab />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

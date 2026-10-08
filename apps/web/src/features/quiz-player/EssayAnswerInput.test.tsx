import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EssayAnswerInput, relativeTime } from "./EssayAnswerInput";
import { localDraftKey, readLocalDraft } from "./local-draft";

const config = {
  allowedSubmissionTypes: ["TEXT_WITH_KATEX" as const],
  maxFileUploads: 3,
};

const status = () => screen.getByTestId("essay-save-status");
const type = (value: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("EssayAnswerInput auto-save", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the 1500 ms debounce before sending the draft", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(<EssayAnswerInput config={config} onSave={onSave} />);

    type("Hel");
    await advance(1000);
    type("Hello");
    await advance(1000);
    // 2 s after the first keystroke, but only 1 s after the last one.
    expect(onSave).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("Unsaved changes...");

    await advance(500);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ text: "Hello" });
  });

  it("shows Unsaved changes... -> Saving... -> Saved", async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<EssayAnswerInput config={config} onSave={onSave} />);
    expect(status()).toBeEmptyDOMElement();

    type("Answer");
    expect(status()).toHaveTextContent("Unsaved changes...");

    await advance(1500);
    expect(status()).toHaveTextContent("Saving...");

    await act(async () => finish());
    expect(status()).toHaveTextContent(/✓ Autosaved/);
  });

  it("reports a failure with a Retry button and recovers", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    render(<EssayAnswerInput config={config} onSave={onSave} />);

    type("Answer");
    await advance(1500);
    expect(status()).toHaveTextContent("Save failed. Retrying...");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance(0);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(status()).toHaveTextContent("✓ Autosaved");
  });

  it("resumes the server draft without saving it again", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(
      <EssayAnswerInput
        config={config}
        initial={{ text: "Earlier work $x^2$" }}
        initialSavedAt="2026-10-08T03:45:00.000Z"
        onSave={onSave}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Earlier work $x^2$");
    expect(status()).toHaveTextContent("✓ Autosaved");
    expect(document.querySelector(".katex")).not.toBeNull();

    await advance(5000);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("autosaves an uploaded attachment and its removal", async () => {
    const attachment = {
      url: "https://cdn.example.test/a.png",
      filename: "a.png",
      mimeType: "image/png",
      size: 10,
    };
    const onSave = vi.fn().mockResolvedValue({});
    const onUpload = vi.fn().mockResolvedValue(attachment);
    render(
      <EssayAnswerInput
        config={{
          allowedSubmissionTypes: ["TEXT_WITH_KATEX", "FILE_UPLOAD"],
          maxFileUploads: 2,
        }}
        onSave={onSave}
        onUpload={onUpload}
      />,
    );

    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("essay-file-input"), {
        target: { files: [file] },
      });
    });
    await advance(1500);
    expect(onSave).toHaveBeenLastCalledWith({
      text: "",
      attachments: [attachment],
    });

    fireEvent.click(screen.getByRole("button", { name: "Xóa a.png" }));
    await advance(1500);
    expect(onSave).toHaveBeenLastCalledWith({ text: "" });
  });

  it("sends a pending edit when the learner leaves the question", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const { unmount } = render(
      <EssayAnswerInput config={config} onSave={onSave} />,
    );
    type("Unfinished");
    unmount();
    await advance(0);
    expect(onSave).toHaveBeenCalledWith({ text: "Unfinished" });
  });

  it("formats how long ago the draft was autosaved", () => {
    const at = new Date("2026-10-08T03:00:00.000Z");
    const later = (ms: number) => at.getTime() + ms;
    expect(relativeTime(at, later(500))).toBe("just now");
    expect(relativeTime(at, later(12_000))).toBe("12s ago");
    expect(relativeTime(at, later(3 * 60_000))).toBe("3m ago");
    expect(relativeTime(at, later(2 * 3_600_000))).toBe("2h ago");
  });

  it("colours the status: green when saved, yellow while saving", async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<EssayAnswerInput config={config} onSave={onSave} />);
    type("x");
    await advance(1500);
    expect(status()).toHaveClass("text-warning-foreground");
    await act(async () => finish());
    expect(status()).toHaveClass("text-success-foreground");
  });

  it("inserts LaTeX delimiters from the toolbar", () => {
    render(<EssayAnswerInput config={config} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Chèn công thức nội dòng" }));
    expect(screen.getByRole("textbox")).toHaveValue("$x^2$");
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("shows upload progress for each file while it uploads", async () => {
    let report!: (percent: number) => void;
    let finish!: (value: {
      url: string;
      filename: string;
      mimeType: string;
      size: number;
    }) => void;
    const onUpload = vi.fn(
      (_file: File, onProgress: (percent: number) => void) =>
        new Promise<never>((resolve) => {
          report = onProgress;
          finish = resolve as never;
        }),
    );
    render(
      <EssayAnswerInput
        config={{
          allowedSubmissionTypes: ["TEXT_WITH_KATEX", "FILE_UPLOAD"],
          maxFileUploads: 2,
        }}
        onSave={vi.fn().mockResolvedValue({})}
        onUpload={onUpload}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId("essay-file-input"), {
        target: { files: [new File(["x"], "scan.png", { type: "image/png" })] },
      });
    });
    act(() => report(40));
    const bar = screen.getByRole("progressbar", { name: "Đang tải scan.png" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("40%")).toBeInTheDocument();
    await act(async () =>
      finish({
        url: "https://res.cloudinary.com/x/scan.png",
        filename: "scan.png",
        mimeType: "image/png",
        size: 5,
      }),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link", { name: "scan.png" })).toBeInTheDocument();
  });
});

describe("EssayAnswerInput offline resilience", () => {
  const setOnline = (online: boolean) => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => online,
    });
    act(() => {
      window.dispatchEvent(new Event(online ? "online" : "offline"));
    });
  };
  const KEY = localDraftKey("attempt-1", "question-1");

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    setOnline(true);
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("keeps typing safe offline, then syncs when the connection returns", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(
      <EssayAnswerInput config={config} onSave={onSave} draftKey={KEY} />,
    );
    setOnline(false);
    expect(screen.getByText(/Mất kết nối mạng/)).toBeVisible();

    type("Typed while offline");
    await advance(5000);
    // Nothing is sent, nothing is lost, and the status says so.
    expect(onSave).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("Offline - Saved locally");
    expect(status()).toHaveAttribute("data-status", "offline");
    expect(status()).toHaveClass("text-danger-foreground");
    expect(screen.getByRole("textbox")).toHaveValue("Typed while offline");
    expect(readLocalDraft<{ text: string }>(KEY)?.value.text).toBe(
      "Typed while offline",
    );

    setOnline(true);
    await advance(0);
    expect(screen.getByText(/Đã kết nối lại/)).toBeVisible();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ text: "Typed while offline" });
    expect(status()).toHaveTextContent("✓ Autosaved");
    // Confirmed by the server: the device copy is no longer needed.
    expect(readLocalDraft(KEY)).toBeNull();
  });

  it("restores an unsynced device draft after a reload and sends it", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: { text: "Typed offline, then closed tab" }, at: 1 }),
    );
    const onSave = vi.fn().mockResolvedValue({});
    render(
      <EssayAnswerInput
        config={config}
        initial={{ text: "Older server draft" }}
        onSave={onSave}
        draftKey={KEY}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue(
      "Typed offline, then closed tab",
    );
    expect(screen.getByText(/Đã khôi phục bản nháp/)).toBeVisible();
    // Unconfirmed by the server, so it is sent straight away.
    await advance(0);
    expect(onSave).toHaveBeenCalledWith({ text: "Typed offline, then closed tab" });
  });

  it("ignores a device draft the server already has", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: { text: "Same" }, at: 1 }),
    );
    render(
      <EssayAnswerInput
        config={config}
        initial={{ text: "Same" }}
        onSave={vi.fn()}
        draftKey={KEY}
      />,
    );
    expect(screen.queryByText(/Đã khôi phục/)).toBeNull();
  });

  it("keeps working when localStorage is unavailable", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      const onSave = vi.fn().mockResolvedValue({});
      render(
        <EssayAnswerInput config={config} onSave={onSave} draftKey={KEY} />,
      );
      type("still saved on the server");
      await advance(1500);
      expect(onSave).toHaveBeenCalledWith({ text: "still saved on the server" });
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

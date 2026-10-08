import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EssayAnswerInput } from "./EssayAnswerInput";

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
    expect(status()).toHaveTextContent(/✓ Saved at/);
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
    expect(status()).toHaveTextContent("✓ Saved");
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
    expect(status()).toHaveTextContent("✓ Saved");
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
});

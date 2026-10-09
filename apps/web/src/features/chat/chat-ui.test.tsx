import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageItem, messageActions } from "./ChatMessageItem";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { layoutMessages } from "./chat-format";
import { connectionStatus } from "./connection-status";
import { reportReason } from "./ModerationDialogs";
import { message } from "./test-server";

describe("connectionStatus", () => {
  const base = { everConnected: false, online: true, subscribed: false };
  it("is green only when connected and in the room", () => {
    expect(connectionStatus({ ...base, state: "connected", subscribed: true })).toBe(
      "connected",
    );
    expect(connectionStatus({ ...base, state: "connected" })).toBe("connecting");
  });

  it("is amber while (re)connecting", () => {
    expect(connectionStatus({ ...base, state: "connecting" })).toBe("connecting");
    expect(
      connectionStatus({ ...base, state: "connecting", everConnected: true }),
    ).toBe("reconnecting");
  });

  it("is red when Pusher gives up or the browser is offline", () => {
    for (const state of ["unavailable", "failed", "disconnected"])
      expect(connectionStatus({ ...base, state })).toBe("disconnected");
    expect(
      connectionStatus({ ...base, state: "connected", subscribed: true, online: false }),
    ).toBe("disconnected");
  });
});

describe("ConnectionStatusBadge", () => {
  it.each([
    ["connected", "Đã kết nối", "bg-success-background"],
    ["reconnecting", "Đang kết nối lại...", "bg-warning-background"],
    ["disconnected", "Mất kết nối", "bg-danger-background"],
  ] as const)("%s reads %s", (status, label, color) => {
    render(<ConnectionStatusBadge status={status} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveClass(color);
  });
});

describe("layoutMessages", () => {
  it("groups a sender's run and splits days", () => {
    const at = (iso: string, n: number, sender = "u1") => ({
      ...message(n),
      createdAt: iso,
      sender: { id: sender, name: sender, avatarUrl: null },
    });
    const rows = layoutMessages(
      [
        at("2026-10-09T08:00:00.000000Z", 1),
        at("2026-10-09T08:01:00.000000Z", 2), // same run
        at("2026-10-09T08:02:00.000000Z", 3, "u2"), // other sender
        at("2026-10-09T08:20:00.000000Z", 4, "u2"), // > 5 min later
        at("2026-10-10T08:00:00.000000Z", 5, "u2"), // next day
      ],
      new Date("2026-10-10T12:00:00Z"),
    );
    expect(rows.map((row) => row.showHeader)).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(rows.map((row) => row.dayDivider)).toEqual([
      "Hôm qua",
      null,
      null,
      null,
      "Hôm nay",
    ]);
  });
});

describe("messageActions", () => {
  const other = message(1);
  const own = { ...message(2), sender: { ...message(2).sender, id: "me" } };
  it("lets learners report others only", () => {
    const viewer = { id: "me", isModerator: false };
    expect(messageActions(other, viewer)).toEqual(["report"]);
    expect(messageActions(own, viewer)).toEqual([]);
  });

  it("lets moderators hide anything and mute others", () => {
    const viewer = { id: "me", isModerator: true };
    expect(messageActions(other, viewer)).toEqual(["hide", "mute"]);
    expect(messageActions(own, viewer)).toEqual(["hide"]);
    expect(
      messageActions({ ...other, status: "HIDDEN" }, viewer),
    ).toEqual([]);
  });
});

describe("reportReason", () => {
  it("joins the choice and the details", () => {
    expect(reportReason("Spam hoặc quảng cáo", "  ")).toBe("Spam hoặc quảng cáo");
    expect(reportReason("Khác", " lừa đảo ")).toBe("Khác: lừa đảo");
  });
});

describe("ChatComposer", () => {
  const setup = (props: Partial<Parameters<typeof ChatComposer>[0]> = {}) => {
    const onSend = vi.fn(async () => true);
    render(
      <ChatComposer
        onSend={onSend}
        sending={false}
        mutedUntil={null}
        offline={false}
        {...props}
      />,
    );
    // Absent while muted: the notice replaces the box.
    return { onSend, input: screen.queryByLabelText("Tin nhắn")! };
  };

  it("sends the trimmed text on Enter and clears the draft", async () => {
    const { onSend, input } = setup();
    await userEvent.type(input, "  Xin chào  {Enter}");
    expect(onSend).toHaveBeenCalledWith("Xin chào");
    expect(input).toHaveValue("");
  });

  it("breaks the line on Shift+Enter and ignores blank drafts", async () => {
    const { onSend, input } = setup();
    await userEvent.type(input, "a{Shift>}{Enter}{/Shift}b");
    expect(input).toHaveValue("a\nb");
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send the Enter that ends a Vietnamese IME composition", async () => {
    const { onSend, input } = setup();
    await userEvent.type(input, "Vieejt");
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    );
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps the draft when the send is refused", async () => {
    const onSend = vi.fn(async () => false);
    const { input } = setup({ onSend });
    await userEvent.type(input, "spam{Enter}");
    expect(input).toHaveValue("spam");
  });

  it("replaces the box with a notice while muted", () => {
    setup({ mutedUntil: "2026-10-10T10:00:00.000Z" });
    expect(screen.getByTestId("chat-muted")).toHaveTextContent(
      "đang bị tạm khóa gửi tin",
    );
    expect(screen.queryByLabelText("Tin nhắn")).toBeNull();
  });

  it("refuses over-long messages", async () => {
    const { onSend, input } = setup();
    await userEvent.click(input);
    await userEvent.paste("x".repeat(2001));
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("ChatMessageItem status", () => {
  const flagged = { ...message(1), status: "FLAGGED" as const };
  const renderItem = (showStatus: boolean) =>
    render(
      <ul>
        <ChatMessageItem
          message={flagged}
          showHeader
          own={false}
          showStatus={showStatus}
          actions={[]}
          onAction={() => {}}
        />
      </ul>,
    );

  it("never tells learners a message was reported", () => {
    renderItem(false);
    expect(screen.queryByText("Đang bị báo cáo")).toBeNull();
  });

  it("flags it for moderators", () => {
    renderItem(true);
    expect(screen.getByText("Đang bị báo cáo")).toBeInTheDocument();
  });
});

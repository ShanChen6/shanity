import type { ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { ChatPageFetcher } from "./api";
import { readChatCache, writeChatCache } from "./chat-cache";
import { fakeServer, message } from "./test-server";
import { useChatMessages } from "./use-chat-messages";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => message(from + i, (from + i) * 10));

function setup(fetcher: ChatPageFetcher) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useChatMessages("u1", "c1", { fetcher }), {
    wrapper,
  });
}
const contents = (messages: { content: string }[]) =>
  messages.map((m) => m.content);

describe("useChatMessages", () => {
  beforeEach(() => {
    window.localStorage.clear();
    onlineManager.setOnline(true);
  });

  it("opens from the device copy at once, then fetches only what it missed", async () => {
    writeChatCache("u1", "c1", { messages: range(1, 20), hasOlder: true });
    const server = fakeServer(range(1, 25));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetcher = vi.fn(async (...args: Parameters<typeof server.fetcher>) => {
      await gate;
      return server.fetcher(...args);
    });
    const { result } = setup(fetcher);

    // Rendered from localStorage before the network answers.
    expect(contents(result.current.messages)).toEqual(contents(range(1, 20)));
    release();
    await waitFor(() => expect(result.current.messages).toHaveLength(25));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ after: "c19" });
    // And the device copy now holds the caught-up history.
    expect(readChatCache("u1", "c1")?.messages).toHaveLength(25);
  });

  it("catches up on reconnect with the messages sent while offline", async () => {
    const server = fakeServer(range(1, 10));
    const { result } = setup(server.fetcher);
    await waitFor(() => expect(result.current.messages).toHaveLength(10));

    act(() => onlineManager.setOnline(false));
    server.state.messages.push(...range(11, 14));
    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(result.current.messages).toHaveLength(14));
    expect(server.state.calls.at(-1)).toMatchObject({ after: "c9" });
  });

  it("re-syncs on demand, e.g. when the real-time socket reconnects", async () => {
    const server = fakeServer(range(1, 5));
    const { result } = setup(server.fetcher);
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    server.state.messages.push(message(6, 60));
    act(() => result.current.sync());
    await waitFor(() => expect(result.current.messages).toHaveLength(6));
  });

  it("pages back through older history", async () => {
    const server = fakeServer(range(1, 130));
    const { result } = setup(server.fetcher);
    await waitFor(() => expect(result.current.messages).toHaveLength(100));
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    expect(result.current.messages).toHaveLength(130);
    expect(result.current.messages[0].content).toBe("m1");
    expect(result.current.hasOlder).toBe(false);
  });

  it("merges pushed messages without duplicates", async () => {
    const server = fakeServer(range(1, 3));
    const { result } = setup(server.fetcher);
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    act(() => {
      result.current.receive(message(4, 40));
      result.current.receive(message(4, 40));
    });
    // React Query notifies observers on the next tick.
    await waitFor(() =>
      expect(contents(result.current.messages)).toEqual([
        "m1",
        "m2",
        "m3",
        "m4",
      ]),
    );
  });

  it("hides a message on the real-time event, on screen and on the device", async () => {
    const server = fakeServer(range(1, 3));
    const { result } = setup(server.fetcher);
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    const target = result.current.messages[1];
    act(() => result.current.hide(target.id));
    await waitFor(() =>
      expect(result.current.messages[1]).toMatchObject({
        status: "HIDDEN",
        content: "",
      }),
    );
    await waitFor(() =>
      expect(
        readChatCache("u1", "c1")?.messages.find((m) => m.id === target.id)
          ?.content,
      ).toBe(""),
    );
  });

  it("wipes the device copy once the server refuses the room", async () => {
    writeChatCache("u1", "c1", { messages: range(1, 20), hasOlder: false });
    const fetcher = vi.fn(async () => {
      throw new ApiError(403, ["Forbidden"], { code: "ENROLLMENT_SUSPENDED" });
    });
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.refused).toBe(true));
    expect(result.current.messages).toEqual([]);
    expect(readChatCache("u1", "c1")).toBeUndefined();
    // Refusals are not retried.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

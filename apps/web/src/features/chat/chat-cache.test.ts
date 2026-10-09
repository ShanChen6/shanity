import { beforeEach, describe, expect, it } from "vitest";
import {
  CHAT_CACHE_MAX_MESSAGES,
  CHAT_CACHE_TTL_MS,
  chatCacheKey,
  clearAllChatCaches,
  readChatCache,
  writeChatCache,
} from "./chat-cache";
import { message } from "./test-server";

describe("chat cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a room per user and course", () => {
    writeChatCache("u1", "c1", { messages: [message(1)], hasOlder: false });
    expect(readChatCache("u1", "c1")?.messages[0].content).toBe("m1");
    expect(readChatCache("u2", "c1")).toBeUndefined();
    expect(readChatCache("u1", "c2")).toBeUndefined();
  });

  it("stores only the newest messages", () => {
    const messages = Array.from({ length: CHAT_CACHE_MAX_MESSAGES + 5 }, (_, i) =>
      message(i + 1),
    );
    writeChatCache("u1", "c1", { messages, hasOlder: false });
    const room = readChatCache("u1", "c1")!;
    expect(room.messages).toHaveLength(CHAT_CACHE_MAX_MESSAGES);
    expect(room.messages[0].content).toBe("m6");
    expect(room.hasOlder).toBe(true);
  });

  it("ignores expired, foreign-version and corrupt copies", () => {
    writeChatCache("u1", "c1", { messages: [message(1)], hasOlder: false }, 0);
    expect(readChatCache("u1", "c1", CHAT_CACHE_TTL_MS + 1)).toBeUndefined();

    window.localStorage.setItem(chatCacheKey("u1", "c2"), "{not json");
    expect(readChatCache("u1", "c2")).toBeUndefined();
    window.localStorage.setItem(
      chatCacheKey("u1", "c3"),
      JSON.stringify({ v: 99, savedAt: Date.now(), room: { messages: [] } }),
    );
    expect(readChatCache("u1", "c3")).toBeUndefined();
  });

  it("clears every room of every account, and nothing else", () => {
    writeChatCache("u1", "c1", { messages: [message(1)], hasOlder: false });
    writeChatCache("u2", "c2", { messages: [message(2)], hasOlder: false });
    window.localStorage.setItem("shanity:essay-draft:a:b", "keep");
    clearAllChatCaches();
    expect(readChatCache("u1", "c1")).toBeUndefined();
    expect(readChatCache("u2", "c2")).toBeUndefined();
    expect(window.localStorage.getItem("shanity:essay-draft:a:b")).toBe("keep");
  });
});

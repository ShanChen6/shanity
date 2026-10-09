import { describe, expect, it } from "vitest";
import {
  CATCH_UP_PAGE_SIZE,
  MAX_CATCH_UP_PAGES,
  catchUpAnchor,
  markHidden,
  mergeMessages,
  syncRoom,
  trimRoom,
} from "./chat-model";
import { fakeServer, message } from "./test-server";
import type { ChatRoomState } from "./types";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => message(from + i));
const contents = (room: ChatRoomState) => room.messages.map((m) => m.content);

describe("mergeMessages", () => {
  it("dedupes by id, keeps keyset order and lets the incoming copy win", () => {
    const flagged = { ...message(2), status: "FLAGGED" as const };
    const merged = mergeMessages([message(3), message(1), message(2)], [
      flagged,
      message(4),
    ]);
    expect(merged.map((m) => m.content)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(merged[1].status).toBe("FLAGGED");
  });

  it("orders same-instant messages by id", () => {
    const a = message(7, 5);
    const b = message(3, 5);
    expect(mergeMessages([a], [b]).map((m) => m.id)).toEqual([b.id, a.id]);
  });
});

describe("catchUpAnchor", () => {
  it("is the newest message at least the overlap older than the newest", () => {
    // Sent at 0, 20, 25, 30 s: 30 - 10 = 20, so the anchor is the 20 s one.
    const messages = [message(1, 0), message(2, 20), message(3, 25), message(4, 30)];
    expect(catchUpAnchor(messages)?.content).toBe("m2");
  });

  it("is null when everything held is that recent", () => {
    expect(catchUpAnchor([message(1, 0), message(2, 5)])).toBeNull();
    expect(catchUpAnchor([])).toBeNull();
  });
});

describe("syncRoom", () => {
  it("starts from the latest page when nothing is held", async () => {
    const server = fakeServer(range(1, 150));
    const room = await syncRoom("c", undefined, () => undefined, server.fetcher);
    expect(room.messages).toHaveLength(CATCH_UP_PAGE_SIZE);
    expect(room.messages.at(-1)?.content).toBe("m150");
    expect(room.hasOlder).toBe(true);
  });

  it("fetches only what was missed while offline, from the overlap on", async () => {
    // Held m1..m40 (one per 10 s); m41..m60 arrived while offline.
    const held: ChatRoomState = {
      messages: range(1, 40).map((m, i) => message(i + 1, (i + 1) * 10)),
      hasOlder: true,
    };
    const server = fakeServer(range(1, 60).map((_, i) => message(i + 1, (i + 1) * 10)));
    const room = await syncRoom("c", held, () => held, server.fetcher);

    expect(server.state.calls).toEqual([{ after: "c39", limit: CATCH_UP_PAGE_SIZE }]);
    expect(contents(room)).toEqual(range(1, 60).map((m) => m.content));
    expect(room.hasOlder).toBe(true);
  });

  it("drops held messages a moderator hid during the outage", async () => {
    const all = range(1, 30).map((_, i) => message(i + 1, (i + 1) * 10));
    const held: ChatRoomState = { messages: all, hasOlder: false };
    const server = fakeServer(all);
    server.state.messages[29] = { ...all[29], status: "HIDDEN" };
    const room = await syncRoom("c", held, () => held, server.fetcher);
    expect(contents(room)).not.toContain("m30");
    expect(room.messages).toHaveLength(29);
  });

  it("keeps older pages loaded while the sync was in flight", async () => {
    const held: ChatRoomState = { messages: range(50, 60), hasOlder: true };
    const later: ChatRoomState = { messages: range(40, 60), hasOlder: true };
    const server = fakeServer(range(1, 62));
    const room = await syncRoom("c", held, () => later, server.fetcher);
    expect(contents(room)).toEqual(range(40, 62).map((m) => m.content));
  });

  it("keeps real-time messages that landed while the sync was in flight", async () => {
    const all = range(1, 30).map((_, i) => message(i + 1, (i + 1) * 10));
    const held: ChatRoomState = { messages: all.slice(0, 25), hasOlder: false };
    const server = fakeServer(all);
    // m31 was pushed after the server answered, before the sync finished.
    const pushed = message(31, 310);
    const room = await syncRoom(
      "c",
      held,
      () => ({ messages: [...held.messages, pushed], hasOlder: false }),
      server.fetcher,
    );
    expect(contents(room).slice(-2)).toEqual(["m30", "m31"]);
    expect(room.messages).toHaveLength(31);
  });

  it("starts over when it is too far behind to bridge", async () => {
    const held: ChatRoomState = { messages: range(1, 20), hasOlder: false };
    const total = 20 + CATCH_UP_PAGE_SIZE * MAX_CATCH_UP_PAGES + 50;
    const server = fakeServer(range(1, total));
    const room = await syncRoom("c", held, () => held, server.fetcher);
    expect(server.state.calls.at(-1)).toEqual({ limit: CATCH_UP_PAGE_SIZE });
    expect(room.messages.at(-1)?.content).toBe(`m${total}`);
    expect(room.messages[0].content).toBe(`m${total - CATCH_UP_PAGE_SIZE + 1}`);
    expect(room.hasOlder).toBe(true);
  });
});

describe("trimRoom", () => {
  it("keeps the newest messages and remembers there are older ones", () => {
    const room = trimRoom({ messages: range(1, 10), hasOlder: false }, 4);
    expect(contents(room)).toEqual(["m7", "m8", "m9", "m10"]);
    expect(room.hasOlder).toBe(true);
  });
});

describe("markHidden", () => {
  it("blanks the content of that one message and leaves the rest", () => {
    const withFile = {
      ...message(2),
      attachments: [{ key: "k", name: "a.png", mimeType: "image/png", size: 1 }],
    };
    const room = markHidden(
      { messages: [message(1), withFile], hasOlder: false },
      withFile.id,
    );
    expect(room.messages[1]).toMatchObject({
      id: withFile.id,
      status: "HIDDEN",
      content: "",
      attachments: [],
    });
    expect(room.messages[0]).toEqual(message(1));
  });

  it("is a no-op for a message not held", () => {
    const room = { messages: [message(1)], hasOlder: false };
    expect(markHidden(room, "missing")).toBe(room);
  });
});

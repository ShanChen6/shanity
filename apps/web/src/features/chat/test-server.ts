import type { ChatPageQuery } from "./api";
import type { ChatHistoryPage, ChatMessage } from "./types";

const T0 = Date.parse("2026-10-10T08:00:00.000Z");

/** Message `n`, sent `seconds` after T0 (microsecond-precision createdAt). */
export function message(n: number, seconds = n): ChatMessage {
  const iso = new Date(T0 + seconds * 1000).toISOString(); // ...sss Z
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    id,
    sender: { id: "u1", name: "An", avatarUrl: null },
    content: `m${n}`,
    attachments: [],
    status: "ACTIVE",
    createdAt: `${iso.slice(0, 23)}000Z`,
    cursor: `c${n}`,
  };
}

/**
 * The history endpoint's semantics over an in-memory list, which a test can
 * change between calls (new messages, a moderator hiding one).
 */
export function fakeServer(initial: ChatMessage[]) {
  const state = { messages: [...initial], calls: [] as ChatPageQuery[] };
  const fetcher = async (
    _courseId: string,
    query: ChatPageQuery = {},
  ): Promise<ChatHistoryPage> => {
    state.calls.push(query);
    const all = state.messages.filter((m) => m.status !== "HIDDEN");
    const limit = query.limit ?? 30;
    const at = (cursor: string) => all.findIndex((m) => m.cursor === cursor);
    if (query.after) {
      const rest = all.slice(at(query.after) + 1);
      return { messages: rest.slice(0, limit), hasMore: rest.length > limit };
    }
    const before = query.cursor ? all.slice(0, at(query.cursor)) : all;
    return {
      messages: before.slice(-limit),
      hasMore: before.length > limit,
    };
  };
  return { state, fetcher };
}

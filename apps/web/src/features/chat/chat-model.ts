import type { ChatPageFetcher } from "./api";
import type { ChatMessage, ChatRoomState } from "./types";

/** Messages per request while catching up (the API's maximum). */
export const CATCH_UP_PAGE_SIZE = 100;
/** Beyond this many pages behind, start over from the latest page instead. */
export const MAX_CATCH_UP_PAGES = 5;
/**
 * Catch-up re-reads the last few seconds the client already holds: a message
 * stamped just before our newest one can commit just after we fetched it, and
 * would otherwise never be seen. Duplicates are merged away by id.
 */
export const CATCH_UP_OVERLAP_MS = 10_000;
export const OLDER_PAGE_SIZE = 30;

/** Keyset order of the API: (createdAt, id). createdAt is fixed-width ISO. */
export const compareMessages = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt < b.createdAt
    ? -1
    : a.createdAt > b.createdAt
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

/** Union by id, oldest first. On a clash the incoming copy (newer news) wins. */
export function mergeMessages(
  held: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(held.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

// Date.parse only promises millisecond ISO strings; ours carry microseconds.
const millis = (createdAt: string) => Date.parse(`${createdAt.slice(0, 23)}Z`);

/**
 * Where catch-up starts reading: the newest held message at least
 * CATCH_UP_OVERLAP_MS older than the newest one. Null when every held message
 * is that recent (or none is held): then just read the latest page.
 */
export function catchUpAnchor(
  messages: readonly ChatMessage[],
  overlapMs = CATCH_UP_OVERLAP_MS,
): ChatMessage | null {
  const newest = messages.at(-1);
  if (!newest) return null;
  const limit = millis(newest.createdAt) - overlapMs;
  for (let i = messages.length - 1; i >= 0; i--)
    if (millis(messages[i].createdAt) <= limit) return messages[i];
  return null;
}

/**
 * Replaces what was held in the span the server just re-read with its
 * answer: there the server is authoritative, so a held message it no longer
 * returns was hidden by a moderator and drops out. Messages that were not
 * held when the request started (pushed in real time, or an older page
 * loaded meanwhile) are kept, as are those before the span unless
 * `dropBefore` (the held history no longer joins up with the new one).
 *
 * `from`: the span is everything after it; null: everything from the first
 * fetched message on.
 */
function reconcile(
  now: readonly ChatMessage[],
  known: ReadonlySet<string>,
  fetched: readonly ChatMessage[],
  from: ChatMessage | null,
  dropBefore = false,
): ChatMessage[] {
  const first = fetched[0];
  const kept = now.filter((message) => {
    if (!known.has(message.id)) return true;
    if (dropBefore) return false;
    if (from) return compareMessages(message, from) <= 0;
    return first !== undefined && compareMessages(message, first) < 0;
  });
  return mergeMessages(kept, fetched);
}

/**
 * Brings `held` up to date with the server: the span after the anchor is
 * re-read in full and replaces what was held there. `current` is read at the
 * end, so older pages and real-time messages that landed meanwhile are kept.
 */
export async function syncRoom(
  courseId: string,
  held: ChatRoomState | undefined,
  current: () => ChatRoomState | undefined,
  fetcher: ChatPageFetcher,
  signal?: AbortSignal,
): Promise<ChatRoomState> {
  const known = new Set(held?.messages.map((message) => message.id));

  const latestPage = async (dropBefore: boolean): Promise<ChatRoomState> => {
    const latest = await fetcher(
      courseId,
      { limit: CATCH_UP_PAGE_SIZE },
      signal,
    );
    const now = current();
    const messages = reconcile(
      now?.messages ?? [],
      known,
      latest.messages,
      null,
      dropBefore,
    );
    const first = latest.messages[0];
    const keptOlder = Boolean(
      first && messages[0] && compareMessages(messages[0], first) < 0,
    );
    return {
      messages,
      hasOlder: keptOlder ? (now?.hasOlder ?? true) : latest.hasMore,
    };
  };

  const anchor = held ? catchUpAnchor(held.messages) : null;
  if (!anchor) return latestPage(false);

  const fetched: ChatMessage[] = [];
  let after = anchor.cursor;
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page++) {
    const result = await fetcher(
      courseId,
      { after, limit: CATCH_UP_PAGE_SIZE },
      signal,
    );
    fetched.push(...result.messages);
    if (!result.hasMore) {
      const now = current();
      return {
        messages: reconcile(now?.messages ?? [], known, fetched, anchor),
        hasOlder: now?.hasOlder ?? held?.hasOlder ?? true,
      };
    }
    after = result.messages.at(-1)!.cursor;
  }
  // Too far behind to bridge: the held history is dropped, not patched.
  return latestPage(true);
}

/**
 * A message a moderator just hid. For learners its content leaves the
 * device (memory and localStorage) at once; the row stays as a HIDDEN
 * placeholder so the list does not jump, and the next sync drops it.
 * Moderators may still read it (`keepContent`): only the status changes.
 */
export function markHidden(
  state: ChatRoomState,
  messageId: string,
  { keepContent = false }: { keepContent?: boolean } = {},
): ChatRoomState {
  if (!state.messages.some((message) => message.id === messageId)) return state;
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id !== messageId
        ? message
        : keepContent
          ? { ...message, status: "HIDDEN" }
          : { ...message, status: "HIDDEN", content: "", attachments: [] },
    ),
  };
}

/** Newest `max` messages; anything cut means the server has older ones. */
export function trimRoom(state: ChatRoomState, max: number): ChatRoomState {
  if (state.messages.length <= max) return state;
  return { messages: state.messages.slice(-max), hasOlder: true };
}

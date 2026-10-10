/**
 * Keyset position of a message: (created_at, id), the order of
 * IDX_chat_messages_course_created. created_at travels as PostgreSQL's own
 * microsecond text, because a JS Date (milliseconds) would round it and make
 * pages skip or repeat messages created within the same millisecond.
 */
export type ChatCursor = { createdAt: string; id: string };

const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Opaque to clients: they only ever hand back what the API gave them. */
export const encodeChatCursor = ({ createdAt, id }: ChatCursor) =>
  Buffer.from(`${createdAt}|${id}`).toString('base64url');

/** The position, or null for anything the API could not have issued. */
export function decodeChatCursor(value: string): ChatCursor | null {
  const [createdAt, id, ...rest] = Buffer.from(value, 'base64url')
    .toString()
    .split('|');
  if (rest.length || !CREATED_AT.test(createdAt ?? '') || !UUID.test(id ?? ''))
    return null;
  // The pattern admits impossible dates such as month 13.
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

// Lowercase only: Pusher channel names are case-sensitive, so an uppercase
// spelling would be a different (silent) channel from the one we publish to.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const COURSE_CHANNEL = new RegExp(`^presence-course-(${UUID})$`);

/** The presence channel of a course's group chat. */
export const courseChannel = (courseId: string) =>
  `presence-course-${courseId}`;

/** The course a chat channel belongs to, or null for any other channel. */
export function courseIdFromChannel(channel: string): string | null {
  return COURSE_CHANNEL.exec(channel)?.[1] ?? null;
}

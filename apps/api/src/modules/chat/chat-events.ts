/**
 * Events the API publishes on `presence-course-<courseId>`. Clients only
 * listen: client events are disabled, so every event here came from the API.
 */
export const ChatEvents = {
  /** A ChatMessageView: a member just sent it. */
  MESSAGE_CREATED: 'message_created',
  /** `{ messageId }`: drop the message's content from view at once. */
  MESSAGE_HIDDEN: 'message_hidden',
  /** `{ userId, mutedUntil }`: that user may not send until then. */
  USER_MUTED: 'user_muted',
} as const;

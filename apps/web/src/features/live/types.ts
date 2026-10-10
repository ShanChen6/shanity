import type { EmbedProvider } from "./embedUrlNormalizer";

export type LiveStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

export type LiveSession = {
  id: string;
  courseId: string;
  course: { id: string; title: string; slug: string };
  instructor: { id: string; name: string; avatarUrl: string | null };
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  provider: EmbedProvider;
  /** As of the server's clock when it answered. */
  status: LiveStatus;
  /** Null while the viewer may not play it: the server never sends it early. */
  embedUrl: string | null;
  isReplay: boolean;
  canManage: boolean;
};

export type LiveSessionResponse = { serverTime: string; session: LiveSession };
export type LiveSessionList = { serverTime: string; sessions: LiveSession[] };

export type CommentStatus = "APPROVED" | "PENDING" | "REJECTED";

export type BlogComment = {
  id: string;
  content: string;
  /** SENDING: only on the author's screen, before the server answers. */
  status: CommentStatus | "SENDING";
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
};

/** GET /api/v1/blog/posts/:slug/comments */
export type CommentPage = {
  comments: BlogComment[];
  /** The viewer's own comments awaiting review (first page only matters). */
  pending: BlogComment[];
  page: number;
  total: number;
  totalPages: number;
};

/** POST /api/v1/blog/posts/:slug/comments */
export type CommentOutcome = {
  comment: BlogComment;
  status: CommentStatus;
  reason: string | null;
  message: string;
};

/** An entry of the admin queue. */
export type QueuedComment = BlogComment & {
  toxicityScore: number | null;
  rejectionReason: string | null;
  moderation: {
    decidedBy?: string;
    rule?: string;
    provider?: string;
    categories?: Record<string, number>;
  };
  post: { id: string; title: string; slug: string };
};

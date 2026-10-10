/** Mirrors BlogPostStatus in apps/api (blog-post.entity.ts). */
export type BlogPostStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "PUBLISHED"
  | "HIDDEN"
  | "ARCHIVED";

/** A post as its author or an admin sees it (`/api/v1/blog/posts`). */
export type AuthoredPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  status: BlogPostStatus;
  author: { id: string; name: string; avatarUrl: string | null };
  category: { id: string; name: string; slug: string } | null;
  linkedCourse: { id: string; title: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
};

export type AuthoredPostDetail = AuthoredPost & {
  content: string;
  /** The last editorial decision, with the note for the author. */
  review: { by: { id: string; name: string }; at: string; note: string | null } | null;
};

/** What the editor sends. Blank optional text clears the field. */
export type PostInput = {
  title: string;
  slug?: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  categoryId: string | null;
};

export type PostAction = "submit" | "withdraw" | "publish" | "reject" | "hide";

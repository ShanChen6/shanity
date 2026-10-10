/** A published post as the public blog lists it. */
export type BlogPostCard = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  category: { name: string; slug: string } | null;
  author: { name: string; avatarUrl: string | null };
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
};

export type BlogPostFull = BlogPostCard & { content: string };

/** The course a post points readers to. */
export type RelatedCourse = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnail: string | null;
  accessType: "FREE" | "PAID";
  /** Minor units. */
  price: number;
  currency: string;
  instructorName: string | null;
};

export type BlogPostPage = {
  post: BlogPostFull;
  relatedCourse: RelatedCourse | null;
};

export type BlogList = {
  items: BlogPostCard[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type BlogCategory = { id: string; name: string; slug: string };

/**
 * Breadcrumbs derived from the URL, so every page gets a trail without
 * declaring one. Labels come from the tables below; a page that knows a
 * better title for a dynamic segment (a course name) passes `overrides`.
 */

/** Static URL segment -> label. */
export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  admin: "Quản trị",
  instructor: "Giảng viên",
  dashboard: "Tổng quan",
  users: "Người dùng",
  orders: "Đơn hàng",
  settings: "Cài đặt",
  courses: "Khóa học",
  quizzes: "Bài kiểm tra",
  grading: "Chấm bài",
  chat: "Thảo luận",
  blog: "Blog",
  student: "Học viên",
  live: "Lớp trực tiếp",
  schedule: "Lịch học",
  comments: "Bình luận blog",
  "chat-moderation": "Kiểm duyệt chat",
  attempts: "Bài làm",
  attempt: "Làm bài",
  results: "Kết quả",
  "quiz-attempts": "Lịch sử làm bài",
  "my-quiz-attempts": "Lịch sử làm bài",
  "my-learning": "Góc học tập",
  "my-courses": "Góc học tập",
  learn: "Học",
  quiz: "Bài kiểm tra",
  profile: "Hồ sơ",
  account: "Tài khoản",
  checkout: "Thanh toán",
  edit: "Chỉnh sửa",
  basic: "Thông tin cơ bản",
  curriculum: "Chương trình học",
  preview: "Xem trước",
  progress: "Tiến độ học viên",
  new: "Tạo mới",
  create: "Tạo mới",
  legal: "Pháp lý",
  terms: "Điều khoản sử dụng",
  privacy: "Chính sách bảo mật",
  forbidden: "Không có quyền truy cập",
};

/** Label for the dynamic segment that follows these parents. */
const DYNAMIC_LABELS: Readonly<Record<string, string>> = {
  users: "Chi tiết người dùng",
  courses: "Chi tiết khóa học",
  quizzes: "Chi tiết bài kiểm tra",
  orders: "Chi tiết đơn hàng",
  attempts: "Chi tiết bài làm",
  "quiz-attempts": "Chi tiết bài làm",
  results: "Chi tiết bài làm",
  learn: "Khóa học",
  checkout: "Đơn hàng",
  quiz: "Bài kiểm tra",
};

/**
 * Every URL a `page.tsx` serves (route groups removed, dynamic segments as
 * `[param]`). A crumb only becomes a link if its path is here, so a trail
 * never points at a 404. navigation.config.test.ts keeps this in step with
 * src/app and prints the diff when it drifts.
 */
export const PAGE_ROUTES: readonly string[] = [
  "/",
  "/account/orders",
  "/admin",
  "/admin/comments",
  "/admin/login",
  "/admin/orders",
  "/admin/settings",
  "/admin/users",
  "/admin/users/[id]",
  "/auth/callback",
  "/blog",
  "/blog/[slug]",
  "/checkout/[orderCode]",
  "/courses",
  "/courses/[slug]",
  "/dashboard",
  "/dev/theme",
  "/forbidden",
  "/instructor",
  "/instructor/chat-moderation",
  "/instructor/courses",
  "/instructor/courses/[id]/edit",
  "/instructor/courses/[id]/edit/basic",
  "/instructor/courses/[id]/edit/curriculum",
  "/instructor/courses/[id]/preview",
  "/instructor/courses/[id]/progress",
  "/instructor/courses/[id]/quizzes",
  "/instructor/courses/new",
  "/instructor/dashboard",
  "/instructor/dashboard/schedule",
  "/instructor/grading",
  "/instructor/grading/attempts/[attemptId]",
  "/instructor/quizzes",
  "/instructor/quizzes/[id]/edit",
  "/instructor/quizzes/create",
  "/learn/[courseSlug]",
  "/learn/[courseSlug]/[lessonSlug]",
  "/learn/[courseSlug]/chat",
  "/learn/[courseSlug]/quiz/[quizId]",
  "/legal/privacy",
  "/legal/terms",
  "/login",
  "/my-courses",
  "/student/courses/[slug]/live/[sessionId]",
  "/student/dashboard/schedule",
  "/my-learning",
  "/orders",
  "/profile",
  "/quiz-attempts",
  "/quiz-attempts/[id]",
  "/quizzes",
  "/quizzes/[slug]",
  "/quizzes/[slug]/attempt",
  "/quizzes/[slug]/results/[attemptId]",
  "/register",
];

const PAGE_PATTERNS = PAGE_ROUTES.map(
  (route) =>
    new RegExp(
      `^${route.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/")}$`,
    ),
);

export function isPageRoute(pathname: string): boolean {
  return PAGE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export interface Crumb {
  href: string;
  label: string;
  /** The page being viewed: never a link. */
  current: boolean;
  /** False when no page exists at this level (an id with no index page). */
  linkable: boolean;
}

export function breadcrumbsFor(
  pathname: string,
  overrides: Readonly<Record<string, string>> = {},
): Crumb[] {
  const segments = pathname.split("?")[0]!.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";
  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const parent = segments[index - 1];
    const known = SEGMENT_LABELS[segment];
    crumbs.push({
      href,
      label:
        overrides[href] ??
        known ??
        (parent && DYNAMIC_LABELS[parent]) ??
        "Chi tiết",
      current: index === segments.length - 1,
      linkable: index < segments.length - 1 && isPageRoute(href),
    });
  });
  return crumbs;
}

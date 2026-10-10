/**
 * The one place navigation is defined. Headers, sidebars, the user menu, the
 * footer sitemap, breadcrumbs and the Cmd+K command menu all read from here,
 * so a route is added, renamed or re-permissioned exactly once.
 *
 * Routes that do not exist must not appear here: navigation.config.test.ts
 * checks every href against the pages under src/app.
 */
import type { IconName } from "@/components/ui/icon";
import {
  ADMIN_ROLES,
  ORDER_CONSOLE_ROLES,
  hasAnyRole,
} from "@/lib/admin-access";
import type { Role } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Any-of. Omitted: every signed-in user. */
  roles?: readonly Role[];
  /** `exact` for items whose path is also a prefix of siblings (dashboards). */
  match?: "prefix" | "exact";
  /** Other path prefixes that keep this item highlighted (renamed routes). */
  aliases?: readonly string[];
  /** Extra search terms for the command menu. */
  keywords?: readonly string[];
}

export const INSTRUCTOR_ROLES: readonly Role[] = ["instructor"];

// ── Student / learner ─────────────────────────────────────────────────────
export const studentNav: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: "grid",
    match: "exact",
    keywords: ["trang chủ", "dashboard"],
  },
  {
    href: "/my-learning",
    label: "Góc học tập",
    icon: "book",
    aliases: ["/my-courses", "/learn"],
    keywords: ["khóa học của tôi", "tiếp tục học"],
  },
  {
    href: "/courses",
    label: "Khóa học",
    icon: "search",
    keywords: ["khám phá", "danh mục", "catalog"],
  },
  {
    href: "/student/dashboard/schedule",
    label: "Lịch học",
    icon: "calendar",
    keywords: ["lớp học trực tiếp", "live", "thời khóa biểu"],
  },
  {
    href: "/quizzes",
    label: "Bài kiểm tra",
    icon: "quiz",
    keywords: ["quiz", "luyện tập"],
  },
  {
    href: "/quiz-attempts",
    label: "Lịch sử làm bài",
    icon: "check",
    aliases: ["/my-quiz-attempts"],
    keywords: ["kết quả", "điểm"],
  },
  {
    href: "/account/orders",
    label: "Đơn hàng",
    icon: "receipt",
    aliases: ["/orders", "/checkout"],
    keywords: ["thanh toán", "hóa đơn"],
  },
];

// ── Instructor ────────────────────────────────────────────────────────────
export const instructorNav: readonly NavItem[] = [
  {
    href: "/instructor/dashboard",
    label: "Tổng quan",
    icon: "grid",
    roles: INSTRUCTOR_ROLES,
    match: "exact",
  },
  {
    href: "/instructor/courses",
    label: "Khóa học của tôi",
    icon: "book",
    roles: INSTRUCTOR_ROLES,
    keywords: ["giáo trình", "bài học"],
  },
  {
    href: "/instructor/quizzes",
    label: "Bài kiểm tra",
    icon: "quiz",
    roles: INSTRUCTOR_ROLES,
    keywords: ["quiz", "soạn đề"],
  },
  {
    href: "/instructor/grading",
    label: "Chấm bài",
    icon: "grading",
    roles: INSTRUCTOR_ROLES,
    keywords: ["tự luận", "chấm điểm"],
  },
  {
    href: "/instructor/dashboard/schedule",
    label: "Lịch giảng dạy",
    icon: "calendar",
    roles: INSTRUCTOR_ROLES,
    keywords: ["lớp học trực tiếp", "live", "điểm danh"],
  },
  {
    href: "/instructor/blog",
    label: "Bài viết blog",
    icon: "grading",
    roles: INSTRUCTOR_ROLES,
    keywords: ["blog", "viết bài", "bài viết"],
  },
  {
    href: "/instructor/chat-moderation",
    label: "Kiểm duyệt chat",
    icon: "bell",
    roles: INSTRUCTOR_ROLES,
    keywords: ["thảo luận", "báo cáo", "tin nhắn", "vi phạm"],
  },
];

// ── Admin / finance ───────────────────────────────────────────────────────
export const adminNav: readonly NavItem[] = [
  {
    href: "/admin",
    label: "Trang quản trị",
    icon: "grid",
    roles: ADMIN_ROLES,
    match: "exact",
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    icon: "users",
    roles: ADMIN_ROLES,
    keywords: ["tài khoản", "phân quyền"],
  },
  {
    href: "/admin/orders",
    label: "Đơn hàng",
    icon: "receipt",
    roles: ORDER_CONSOLE_ROLES,
    keywords: ["thanh toán", "đối soát", "hoàn tiền"],
  },
  {
    href: "/admin/blog",
    label: "Blog",
    icon: "book",
    roles: ADMIN_ROLES,
    keywords: ["bài viết", "duyệt bài", "viết bài", "xuất bản"],
  },
  {
    href: "/admin/comments",
    label: "Bình luận blog",
    icon: "bell",
    roles: ADMIN_ROLES,
    keywords: ["kiểm duyệt", "spam", "bình luận"],
  },
  {
    href: "/admin/settings",
    label: "Cài đặt hệ thống",
    icon: "settings",
    roles: ADMIN_ROLES,
    keywords: ["cấu hình", "trạng thái"],
  },
];

/** Account pages every signed-in user has, whatever their role. */
export const accountNav: readonly NavItem[] = [
  { href: "/profile", label: "Hồ sơ & cài đặt tài khoản", icon: "user" },
];

// ── Site header ───────────────────────────────────────────────────────────
// The header carries only the handful of sections people open every visit, so
// it fits one row from 1024px. Everything else in studentNav stays reachable
// through the user menu, the mobile panel and the command menu.
function learnerItem(href: string): NavItem {
  const item = studentNav.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`studentNav has no ${href}`);
  return item;
}

export const blogNavItem: NavItem = {
  href: "/blog",
  label: "Blog",
  icon: "info",
  keywords: ["bài viết", "tin tức", "kiến thức"],
};

/** Visitors: what they can open without an account. */
export const publicHeaderNav: readonly NavItem[] = [
  learnerItem("/courses"),
  blogNavItem,
];

/** Signed-in users: learning first, then discovery. */
export const learnerHeaderNav: readonly NavItem[] = [
  learnerItem("/my-learning"),
  learnerItem("/courses"),
  learnerItem("/student/dashboard/schedule"),
  {
    ...learnerItem("/quizzes"),
    // Attempt history lives in the user menu; keep its section lit meanwhile.
    aliases: ["/quiz-attempts", "/my-quiz-attempts"],
  },
  blogNavItem,
];

/** The learner pages the header leaves out, offered in the user menu. */
export const userMenuNav: readonly NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: "grid" },
  { href: "/my-learning", label: "Khóa học của tôi", icon: "book" },
  { href: "/quiz-attempts", label: "Lịch sử làm bài", icon: "check" },
  { href: "/account/orders", label: "Đơn hàng", icon: "receipt" },
  { href: "/profile", label: "Cài đặt tài khoản", icon: "user" },
];

/** Shortcuts surfaced by the command menu rather than a sidebar. */
export const quickActions: readonly NavItem[] = [
  {
    href: "/instructor/courses/new",
    label: "Tạo khóa học mới",
    icon: "book",
    roles: INSTRUCTOR_ROLES,
    keywords: ["thêm", "new course"],
  },
  {
    href: "/instructor/quizzes/create",
    label: "Tạo bài kiểm tra mới",
    icon: "quiz",
    roles: INSTRUCTOR_ROLES,
    keywords: ["thêm", "new quiz"],
  },
  {
    href: "/instructor/blog/new",
    label: "Viết bài blog mới",
    icon: "grading",
    roles: INSTRUCTOR_ROLES,
    keywords: ["thêm", "blog", "new post"],
  },
  {
    href: "/admin/blog/new",
    label: "Viết bài blog mới",
    icon: "book",
    roles: ADMIN_ROLES,
    keywords: ["thêm", "blog", "new post"],
  },
];

// ── Portals (the workspace switcher) ──────────────────────────────────────
export interface Portal {
  id: "student" | "instructor" | "admin";
  label: string;
  href: string;
  icon: IconName;
  roles?: readonly Role[];
}

export const portals: readonly Portal[] = [
  {
    id: "student",
    label: "Không gian học tập",
    href: "/my-learning",
    icon: "book",
  },
  {
    id: "instructor",
    label: "Không gian giảng viên",
    href: "/instructor/dashboard",
    icon: "grading",
    roles: INSTRUCTOR_ROLES,
  },
  {
    id: "admin",
    label: "Trang quản trị",
    href: "/admin",
    icon: "settings",
    roles: ORDER_CONSOLE_ROLES,
  },
];

export function portalsFor(roles: readonly Role[]): Portal[] {
  return portals
    .filter((portal) => !portal.roles || hasAnyRole(roles, portal.roles))
    .map((portal) =>
      // Finance officers have no overview page, only the order console.
      portal.id === "admin" && !roles.includes("admin")
        ? { ...portal, href: "/admin/orders" }
        : portal,
    );
}

// ── Footer sitemap (public, no session needed) ────────────────────────────
export interface FooterGroup {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}

export const footerNav: readonly FooterGroup[] = [
  {
    title: "Khám phá",
    links: [
      { href: "/courses", label: "Khóa học" },
      { href: "/blog", label: "Blog" },
      { href: "/quizzes", label: "Bài kiểm tra" },
    ],
  },
  {
    // Not "Tài khoản": that is the name of the header's account landmark.
    title: "Tham gia",
    links: [
      { href: "/login", label: "Đăng nhập" },
      { href: "/register", label: "Tạo tài khoản" },
      { href: "/my-learning", label: "Góc học tập" },
    ],
  },
  {
    title: "Pháp lý",
    links: [
      { href: "/legal/terms", label: "Điều khoản sử dụng" },
      { href: "/legal/privacy", label: "Chính sách bảo mật" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────
/** Items the given roles may open. Items without `roles` need only a session. */
export function navigationFor(
  items: readonly NavItem[],
  roles: readonly Role[],
): NavItem[] {
  return items.filter((item) => !item.roles || hasAnyRole(roles, item.roles));
}

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return [item.href, ...(item.aliases ?? [])].some((prefix) =>
    under(pathname, prefix),
  );
}

/**
 * The most specific item for a path: `/instructor/courses/new` belongs to
 * "Khóa học của tôi", not to a shorter sibling prefix.
 */
export function activeNavItem(
  pathname: string,
  items: readonly NavItem[],
): NavItem | undefined {
  return items
    .filter((item) => isNavActive(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Everything a signed-in user can reach by search/keyboard, role-filtered. */
export function searchableNavigation(roles: readonly Role[]): NavItem[] {
  const seen = new Set<string>();
  return [
    ...studentNav,
    blogNavItem,
    ...instructorNav,
    ...adminNav,
    ...quickActions,
    ...accountNav,
  ].filter((item) => {
    if (seen.has(item.href)) return false;
    if (item.roles && !hasAnyRole(roles, item.roles)) return false;
    seen.add(item.href);
    return true;
  });
}

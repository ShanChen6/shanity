# Admin Foundation — Shanity

## Existing Architecture

Audit trên working tree local có remote `https://github.com/ShanChen6/shanity.git`. Admin shell và authorization đã có từ bước trước; lần này tổ chức lại foundation, không xây lại Auth.

### Frontend

- Next.js 16.3.6 App Router, React 19, TypeScript strict, Tailwind CSS 4. Root `src/app/layout.tsx` cấp ThemeProvider và SessionProvider; route group `(protected)` chứa dashboard/profile/my-courses/admin. Admin có layout lồng riêng tại `(protected)/admin/layout.tsx`.
- Design system: `src/styles/color.css`, `theme.css`, `typography.css`, `responsive.css`, `base.css`; semantic tokens cho surface/border/foreground/primary, light/dark/system, focus ring và reduced motion. Responsive theo sm/lg, `minmax(0,1fr)`, container/gutter; admin sidebar desktop từ lg, mobile dùng disclosure navigation.
- Shared UI có Button, Card, Avatar, Skeleton, Alert, form controls; layout có PageHeader/PageContainer; shared states có EmptyState/LoadingState/ErrorState. Icon là SVG nội bộ `components/ui/icon.tsx`, không dùng thư viện icon bên ngoài.
- `src/lib/api.ts`: fetch cookie credentials=include, no-store, timeout, ApiError, refresh một lần, Web Locks/phối hợp nhiều tab. User contract: id/email/displayName/roles.
- State dùng React Context: SessionProvider giữ current user trong bộ nhớ, load/reload/focus và BroadcastChannel; ThemeProvider quản lý theme. Không có Redux/Zustand/React Query trong dependencies hiện tại. Admin chỉ có local state để mở/đóng mobile menu.

### Backend

- NestJS + PostgreSQL qua TypeORM, có User entity và SQL migration; xem [TypeORM](typeorm.md).
- `users`: UUID id, email chuẩn hóa/unique, display_name, password_hash nullable, created_at; migration auth bổ sung status `active|disabled`. `auth_identities`, `auth_sessions` lưu identity/phiên riêng.
- `roles` và `user_roles` là schema RBAC, role code `student|instructor|admin`, hỗ trợ nhiều role/user. Không có backend Role enum riêng; frontend có union Role trong `lib/api.ts`.
- Chưa có UserModule/UserService riêng. `UsersController` nằm trong `auth/auth.controller.ts`, đăng ký trong AuthModule; profile/authenticate do AuthService xử lý.
- Không có lớp RolesGuard/JwtGuard riêng: `SessionGuard` thực hiện cả hai trách nhiệm. AuthService xác minh JWT HS256 bằng jose, issuer/audience, kiểm tra user active, phiên còn hạn/chưa revoke; role được lấy từ database. Decorator `@Roles(...)` và Reflector cung cấp RBAC; thiếu role trả 403. OriginGuard kiểm tra origin với request ghi.

## Admin Foundation Implemented

- Layout riêng cho admin, sidebar desktop, header/hồ sơ, breadcrumb, active state, main content, mobile navigation, skip link, aria-expanded, Escape trả focus về toggle.
- Navigation configuration chỉ gồm Dashboard (`Trang quản trị`) và Users (`Người dùng`). Sidebar/mobile/breadcrumb dùng chung config. Không triển khai module Course/Lesson/Quiz.
- AdminLayout giữ phần khung ở server; các phần cần pathname, session hoặc tương tác là client components nhỏ.
- Dùng theme và shared UI hiện có; không thêm dependency/design system. Dashboard là landing page tối giản. Users là cấu trúc trang với placeholder trung thực, không giả số liệu/danh sách, không gọi API quản lý users chưa tồn tại.
- Giữ authorization hiện có: Proxy chặn guest; server layout ngoài kiểm tra role trước client gate; layout admin và từng page gọi requireRole('admin'). Client guard xử lý mất role khi phiên được tải lại. Người thiếu quyền tới `/forbidden`; guest giữ return URL qua login.
- Cookie host-only yêu cầu web/public API cùng hostname; Next gọi backend qua API_INTERNAL_URL trong Compose. Đây là giới hạn triển khai hiện có, không thay đổi Auth để mở rộng scope. NestJS vẫn là security boundary cho mọi API dữ liệu.

## Routes Created

Hai route đã tồn tại ở đầu task và được hoàn thiện foundation:

| Route | Trạng thái |
| --- | --- |
| `/admin` | Landing page, liên kết tới Users, chỉ admin |
| `/admin/users` | PageHeader + placeholder User Management, chỉ admin |

Giữ nguyên route từ chối `/forbidden` và các route authentication hiện có.

## Components Created

Tách từ admin shell có sẵn:

- AdminSidebar: brand, navigation desktop, liên kết về Shanity.
- AdminHeader: breadcrumb theo config, mobile toggle, thông tin current user.
- AdminMainContent: main landmark, skip-link target, khung nội dung responsive.
- AdminNavigation: active links dùng chung cho desktop/mobile.
- AdminMobileNavigation: disclosure container, đóng khi chọn mục và hỗ trợ focus từ header.
- AdminLayout: compose các component trên.

Tái dùng PageHeader, EmptyState, Card, Button, Icon, Avatar. Không tạo stat card vì chưa có nguồn thống kê thật và task không cần analytics.

## Existing User APIs

Đọc trực tiếp `apps/api/src/auth/auth.controller.ts` và DTO, không suy đoán endpoint:

| Method/path | Bảo vệ | Hợp đồng thực tế |
| --- | --- | --- |
| GET `/users/me` | SessionGuard | Current user: id, email, displayName, roles |
| PATCH `/users/me` | OriginGuard + SessionGuard | Chỉ sửa displayName của chính user; trim, 1–100 ký tự, không toàn whitespace; trả profile |
| GET `/users/admin-check` | SessionGuard + Roles('admin') | `{ authorized: true }`, không trả danh sách users |

AuthModule còn cung cấp register/login/refresh/logout và Google OAuth/link; các API đó không thay đổi trong task này.

## Backend Gaps

- Chưa có API admin list/detail users, pagination/search/filter/sort hoặc DTO response cho danh sách.
- Chưa có API admin thay đổi role, enable/disable, tạo/xóa tài khoản; chưa có policy cho tự hạ quyền hoặc admin cuối cùng.
- Chưa có audit trail cho thao tác quản trị người dùng.
- Chưa có UserModule/UserService độc lập để tổ chức các chức năng quản lý sắp tới. Đây là gap tổ chức/mở rộng, không phải lý do rewrite Auth.
- Authorization hiện tại đủ cho shell. Các API quản trị mới phải tự dùng SessionGuard + Roles('admin'); frontend guard không thay thế kiểm tra backend.

Chỉ ghi nhận các gap; chưa triển khai API, migration hay chính sách mới.

## Files Changed

Phạm vi thay đổi **trong task audit/foundation này** (working tree còn chứa công việc ở các lượt trước):

- `apps/web/package.json`: thêm script typecheck (`next typegen && tsc --noEmit`).
- `apps/web/src/components/layout/admin-layout.tsx`: chuyển thành composition của các component độc lập.
- `apps/web/src/components/layout/admin/admin-sidebar.tsx`
- `apps/web/src/components/layout/admin/admin-header.tsx`
- `apps/web/src/components/layout/admin/admin-main-content.tsx`
- `apps/web/src/components/layout/admin/admin-navigation.tsx`
- `apps/web/src/components/layout/admin/admin-mobile-navigation.tsx`
- `apps/web/src/features/admin/navigation.ts`: config/matching dùng chung.
- `apps/web/src/app/(protected)/admin/page.tsx`: dùng shared PageHeader.
- `apps/web/src/app/(protected)/admin/users/page.tsx`: dùng shared PageHeader/EmptyState.
- `docs/admin.md`: audit, hợp đồng API, scope và gaps.

Không sửa Login/Register, frontend auth infrastructure hoặc backend source trong task này.

## Test Results

- `pnpm --filter web lint`: PASS.
- `pnpm --filter web typecheck`: PASS (next typegen + tsc --noEmit).
- `pnpm --filter web build`: PASS.
- `pnpm --filter web test:e2e --grep 'admin '`: 6/6 PASS, NestJS/PostgreSQL test riêng. Bao gồm guest redirect, student/instructor không có JavaScript, giả header, admin navigation/breadcrumb/mobile, kích thước 320–1440px, gỡ role và login return URL.
- Đã đối chiếu SHA-256 với đầu task: 34 file Auth/backend (gồm Login/Register và hạ tầng guard) không thay đổi.
- `git diff --check`: PASS. Môi trường test riêng được dọn; không sửa dữ liệu/container ứng dụng đang chạy.

## Recommended Next Task

Thiết kế và triển khai API **đọc danh sách người dùng cho admin**: thống nhất DTO không chứa password/token, pagination/search/filter/sort, bảo vệ bằng RBAC hiện có và test guest/non-admin/admin. Sau khi hợp đồng ổn định mới nối bảng Users ở frontend. Chưa thực hiện task tiếp theo.

## Task 04 — Search, filters and pagination

- `GET /users` (admin only): `page` (default 1), `limit` (default 20, max 100), optional `search` (trimmed, max 254), `role` (`student|instructor|admin`), `status` (`active|disabled`). Invalid API parameters return 400.
- Search matches name/email case-insensitively as a literal substring. Filters combine with AND. Role membership does not duplicate users; results retain all roles. Count and page use the same filters, ordered by created date and ID descending.
- `/admin/users?page=2&search=shan&role=student&status=active`: URL-backed form and previous/next navigation, 20 users per page. Apply resets to page 1; clear removes filters. Reload/back/forward restore applied filters. Loading, retry, no matches and out-of-range pages have explicit states.
- No user detail or role update functionality added.

## Task 05 — User Detail API

- `GET /users/:id`: requires an authenticated user with the `admin` role, checked from the database by SessionGuard. Guest: 401; non-admin: 403; malformed UUID: 400; missing user: 404.
- Response allowlist: `id`, `email`, `displayName`, `status`, `roles`, `createdAt`. Explicit SQL selection and response mapping exclude password hashes, identities and session/token data. Response uses `Cache-Control: no-store`.
- Admin can read active or disabled accounts. Static `/users/me` and `/users/admin-check` routes remain ahead of `/:id`. No update endpoint or frontend detail UI added.

## Task 06 — Read-only User Detail UI

- `/admin/users/[id]` checks admin authorization and loads `GET /users/:id` through the existing authenticated API client. Shows display name, email, all roles, status, creation timestamp (Vietnam timezone), and user ID. The user schema has no `updated_at`; no synthetic updated date or new schema fields are introduced.
- Desktop/mobile list links open the detail page; the return link preserves page/search/role/status. Detail breadcrumb, loading, missing user, malformed ID, forbidden and retry states are provided. No editing controls or mutation requests added.

## Task 07 — Update timestamp and Change User Role

- Migration `202610010001_user_update_at.ts` adds `users.update_at` (timestamptz, required, default now). Existing rows start at `created_at` because historical update times were not recorded. A database trigger advances the timestamp for user updates; role changes explicitly touch the user inside the same transaction. List/detail/mutation responses expose `updatedAt`, displayed on the detail page.
- `PATCH /users/:id/role`, body exactly `{ "role": "STUDENT" | "INSTRUCTOR" | "ADMIN" }`. Values map to existing lowercase database role codes. The operation replaces all existing roles with the selected single role. Reassigning an identical single role is a no-op, preserving its timestamp.
- Requires a valid session, admin role and trusted Origin. Extra properties (including status), missing/invalid/lowercase roles and malformed UUIDs return 400. Missing user returns 404. Self-demotion returns 409; the service also checks that another active admin remains before removing admin from a target.
- Role mutations use a transaction-scoped advisory lock and recheck the actor's active/admin state after acquiring the lock. Competing admin demotions cannot both succeed. Reads of authorization continue to use database roles, so the changed permissions take effect on subsequent requests. This lock coordinates this endpoint; manual SQL or future mutation paths must respect the same invariant.
- Detail UI adds a select and native modal confirmation showing the account, old roles and replacement role. Cancel/Escape send no request; in-flight submissions are guarded, errors remain in the dialog, successful responses update roles and timestamp. Self-demotion choices are disabled as a convenience; backend enforces the policy independently.
- No account-status editing added. Apply the migration before deploying the API: `pnpm --filter api db:migrate`.

Validation for Task 07: isolated PostgreSQL migration and 3 admin API integration tests passed (including competing demotions); 2 browser scenarios passed (detail regression and role confirmation/cancel/persistence/error/self safeguards); 7 unit tests passed; API build, frontend typecheck and both lints passed. Migration has not been applied to the application database.

## Task 08 — Account Status Management

- Uses the existing `users.status` constraint (`active|disabled`, migration `202609270004_auth.mjs`); no new status model, status migration or delete endpoint.
- `PATCH /users/:id/status` accepts exactly `{ "status": "ACTIVE" | "DISABLED" }`, mapped to the existing lowercase database values. Extra properties (including role), missing/invalid status and malformed UUID return 400; missing user returns 404. Requires session, admin and trusted Origin; response is the safe user detail with `Cache-Control: no-store`.
- Status and role changes share a transaction advisory lock and recheck the actor's active/admin state after acquiring it. Self-disable returns 409, and disabling an admin requires another active admin. Concurrent disable/demotion cannot remove all active admins through these endpoints.
- Changes preserve roles, profile, credentials and related records. The existing `update_at` trigger advances the timestamp only when the status changes; repeated requests for the current status are no-ops.
- Existing authentication already rejects disabled accounts on password/Google login, refresh and protected API requests. Disabling blocks existing sessions while the account is disabled; activation restores access, including still-valid sessions. This task does not introduce permanent session revocation or change the auth lifecycle.
- User detail includes a Disable/Activate button and confirmation dialog, cancel/Escape, pending protection, success/error states and updated status/timestamp. Self-disable is unavailable in the UI as well as rejected by the API. No hard-delete functionality.

Task 08 validation: 2 PostgreSQL API integration tests (status security/session gating and role concurrency regression), 2 Chromium browser scenarios (status flow and role regression), 7 unit tests, API build, frontend typecheck, both lints and diff whitespace checks passed. Test servers/database were removed; application database was not modified.

## Task 09 — Admin Overview

- `GET /users/stats` requires SessionGuard + admin and returns only five numeric counts: `totalUsers`, `students`, `instructors`, `admins`, `activeUsers`. Static route is registered before `/users/:id`; response has `Cache-Control: no-store`.
- One PostgreSQL statement aggregates `users` and `user_roles` separately and combines their single-row results, giving a consistent snapshot without transferring users to the API/browser for counting. Total counts each user once, including disabled and roleless users; active means status `active`. Role counts include disabled accounts and overlap for multi-role users, with each membership counted once by the existing composite primary key. Empty counts are zero.
- `/admin` shows five responsive statistic cards with loading skeletons, error/retry and explicit forbidden states, using the existing authenticated API client. No chart, new dependency or schema migration. Counts are fetched when the overview mounts (including page reload); they are not a live subscription.

Task 09 validation: PostgreSQL integration coverage passed for access control, exact response fields, overlapping roles, roleless/disabled users and updates after role/status changes; Chromium overview test passed for real counts, loading/retry/zero states, 320px layout and no full-list API requests. API build/typecheck, frontend typecheck and both lints passed. Isolated test services were removed.

## Task 10 — Admin UX Polish

- UX-only changes; backend source and schema remain byte-for-byte unchanged from the start of this task. No new business feature, dependency or permission policy.
- Admin mutations now use a shared dismissible success toast, preserved across admin navigation. It does not auto-dismiss, so keyboard/screen-reader users can read and close it. Errors remain in the relevant confirmation dialog.
- Confirmation dialogs keep native modal semantics, explicit Tab/Shift+Tab wrapping, Cancel-first focus, Escape handling, pending submission guards and background scroll locking. Closing restores focus to the trigger; after a role change disables the trigger, focus returns to the role select. Error text receives focus. Toast dismissal returns focus to the main content.
- Added admin route loading/error recovery. List errors distinguish forbidden access from retryable failures; empty states distinguish an empty system, no filter matches and an out-of-range page, with relevant recovery links. Retry keeps focus on a stable content container.
- User list shows the visible result range and pagination at both ends, 44px controls, explicit unavailable previous/next states and pending navigation feedback. Filter/page navigation preserves URL state and moves focus to the loaded results. Detail breadcrumbs retain list filters/page when returning.
- Desktop/tablet table has a focusable horizontal scroll region and fixed column widths; long names/emails wrap instead of stretching the page. Mobile cards show complete wrapped values. Empty roles are labelled. Detail/dialog names handle unbroken strings. Both table dates and detail dates use Vietnam time.
- Mobile navigation remains a disclosure rather than a modal: Escape closes and returns focus, links close it, browser history closes it, desktop resizing resets it and moves focus out of controls that become hidden. Sidebar/mobile menu can scroll in short viewports.

Task 10 validation: 10 existing admin browser scenarios passed; the 2 new UX scenarios passed after fixing tablet overflow and dialog focus wrapping. Coverage includes 320/768/1440px, long unbroken text, keyboard table scrolling, filter/page return state, empty/forbidden states, confirmation cancellation/pending/errors, focus restoration, toast dismissal and mobile-menu resize behavior. Production web build, typecheck, lint and diff whitespace checks passed. Backend/schema hashes match the start of the task. Isolated test services were cleaned up.

## Separate Admin Login

The existing Admin Tasks 1–10 remain intact. Admin now enters through `/admin/login`; the User Portal keeps `/login`. See [the implementation, security and validation report](admin-login.md).

## User creation and editing

See [Admin user CRUD](admin-user-crud.md) for creation/edit APIs, dashboard dialogs, retained Disable Account behavior and validation.

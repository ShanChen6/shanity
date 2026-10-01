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

- NestJS + PostgreSQL qua Knex, schema bằng SQL migration; không có ORM User entity. `UserRow` nằm trong `auth.service.ts`.
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

# Tích hợp frontend Auth + User

## Chạy ứng dụng

Backend giữ nguyên cookie HttpOnly, không dùng bearer token hoặc localStorage ở frontend. Cấu hình trong `.env` gốc (không commit file này):

```dotenv
WEB_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
```

Giữ PG*, JWT_SECRET, thời hạn token và Google client ID/secret theo [hướng dẫn backend](auth.md). Đăng ký chính xác GOOGLE_CALLBACK_URL ở Google Cloud. Đây là callback **backend**, không phải route frontend `/auth/callback`.

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm --filter api db:migrate
pnpm dev:api
# Terminal khác
pnpm dev:web
```

- Web: http://localhost:3000/login, `/register`, `/profile`.
- API: http://localhost:4000. CORS chỉ chấp nhận WEB_ORIGIN; trình duyệt tự gửi Origin với POST/PATCH.
- Sau Google, backend chuyển tới `WEB_ORIGIN/auth/callback?result=signed_in` hoặc `result=linked`. Lỗi chuyển tới cùng route với mã cố định `error=cancelled|account_conflict|rate_limited|unavailable|failed`. Không có token/code/secret/raw error trong redirect frontend.
- Các role hiện cùng về `/profile` vì chưa có dashboard tương ứng. Chỉ admin thấy thao tác thử quyền `/users/admin-check`; student không thấy và backend trả 403 nếu gọi trực tiếp.

Next config chỉ đọc giá trị public API URL từ `.env` gốc; không đưa các biến backend vào bundle. Biến môi trường đã export hoặc `.env.local` của web được ưu tiên. URL phải là origin HTTP(S), không path/query. `NEXT_PUBLIC_API_URL` được đóng vào bundle lúc build: đổi origin phải build lại. Compose truyền public URL qua build arg cho web. Browser dùng URL host/public, **không** dùng hostname nội bộ `api`.

```bash
docker compose up --build -d
```

Local Compose dùng API_NODE_ENV=development như mẫu. Production cần HTTPS, API_NODE_ENV=production, web/API cùng site (cùng scheme và miền gốc), CORS đúng origin. Cookie Secure và SameSite=Lax của backend không hỗ trợ mô hình web/API khác site; không nới SameSite để né cấu hình.

## Hợp đồng đã nối

| API | Frontend / dữ liệu |
| --- | --- |
| POST /auth/register | `/register`: email chuẩn hóa, password 12–128 ký tự, displayName trim 1–100; không gửi role; thành công cấp phiên ngay |
| POST /auth/login | `/login`: email/password; 401 hiển thị chung, không tiết lộ email hoặc tình trạng disabled |
| POST /auth/refresh | API client tự gọi sau 401, xoay cookie, retry request gốc đúng một lần |
| POST /auth/logout | `/profile`: chờ backend thu hồi rồi xóa state; lỗi mạng giữ UI và báo thử lại, không giả vờ logout thành công |
| GET /auth/google | Điều hướng toàn trang đến backend, nhận cookie OAuth HttpOnly; không gọi SDK Google phía client |
| GET /auth/google/callback | Backend xử lý code/state/nonce; frontend `/auth/callback` chỉ kiểm tra profile và hiển thị trạng thái/lỗi |
| POST /auth/google/link | Người đã đăng nhập bắt đầu từ `/profile`; không tự liên kết theo email |
| GET /users/me | Bootstrap/reload/focus/tab thay đổi; trường id/email/displayName/roles |
| PATCH /users/me | Chỉ gửi displayName; email/role là thông tin chỉ đọc |

DTO frontend dùng cùng thư viện validator mà class-validator backend sử dụng (`isEmail`, `isLength`), cùng giới hạn và trim/lowercase. Lỗi 400 được ánh xạ theo tên trường, email trùng 409 vào trường email; 403/429/network lỗi chung bằng tiếng Việt. Ref khóa thao tác và native disabled chặn gửi form lặp.

## Kiến trúc phiên

- `src/lib/api.ts`: fetch credentials=include, no-store, timeout 15s, ApiError; không đọc document.cookie hoặc ghi token/profile vào storage.
- `features/auth/session-provider.tsx`: profile chỉ ở bộ nhớ, bootstrap bằng API; trạng thái loading/authenticated/anonymous/error. Generation counter ngăn response cũ khôi phục state sau logout. BroadcastChannel chỉ gửi sự kiện changed/logout, không có token hay dữ liệu hồ sơ.
- Refresh có một promise dùng chung trong tab. Web Locks tuần tự hóa refresh/login/logout giữa các tab cùng origin. Khi lấy được lock, client kiểm tra `/users/me` trước: nếu tab khác đã refresh thì dùng cookie mới, không rotate lần nữa. Browser không có Web Locks vẫn có bảo vệ trong một tab; cần browser hiện đại/secure context (localhost hoặc HTTPS) để có bảo vệ nhiều tab đầy đủ.
- Refresh thất bại phát sự kiện xóa state. `/profile` chuyển về `/login`. Lỗi mạng khi tải profile ban đầu hiển thị thử lại. Session đọc lại khi tab lấy focus; quyền hiển thị có thể cũ giữa hai request nhưng backend luôn kiểm tra quyền hiện hành.
- `/profile` render trạng thái chờ trước khi có profile, không đưa dữ liệu cá nhân vào HTML tĩnh. Đây là bảo vệ UI; backend vẫn là ranh giới bảo mật. Không tạo dashboard giả hay nhận URL `next` tùy ý.
- Thông số `result/error` trên callback chỉ điều khiển thông báo/điều hướng, không chứng minh xác thực. Frontend luôn gọi profile qua cookie; tự nhập URL callback không cấp quyền.

## Điều chỉnh backend tối thiểu

Thêm `OAuthRedirectFilter` chỉ cho GET bắt đầu Google/callback để lỗi từ controller hoặc guard (kể cả rate limit) trở về frontend bằng allowlist mã lỗi. Endpoint link vẫn trả JSON và được SessionGuard bảo vệ. Callback thành công chuyển về `/auth/callback` thay vì trang chủ. Không đổi schema, DTO, chính sách cookie, cách cấp JWT hoặc quy tắc liên kết tài khoản. Backend e2e đã cập nhật kiểm tra redirect mới.

## Kiểm thử tự động

```bash
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e  # cần PostgreSQL và cấu hình test
pnpm --filter web lint
pnpm --filter web build
```

Browser test mới ở `apps/web/tests/auth.spec.ts`, chạy bằng `pnpm --filter web test:e2e`. Chỉ dùng DB riêng có tên kết thúc `_test`; tests tạo email ngẫu nhiên và không reset DB. Các cập nhật disabled/revoked chỉ nhắm user do chính test tạo. Không trỏ vào dữ liệu production.

Ví dụ môi trường thử riêng, từ root (giữ env giống nhau ở các terminal):

```bash
export PGHOST=localhost PGPORT=55442 PGUSER=shanity_test
export PGPASSWORD="$(openssl rand -hex 24)"
export PGDATABASE=shanity_browser_test
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_ACCESS_SECONDS=900 AUTH_REFRESH_SECONDS=2592000
export WEB_ORIGIN=http://localhost:55461
export NEXT_PUBLIC_API_URL=http://localhost:55462
export GOOGLE_CLIENT_ID=browser-fixture GOOGLE_CLIENT_SECRET=browser-fixture-secret
export GOOGLE_CALLBACK_URL=http://localhost:55462/auth/google/callback
export NODE_ENV=test AUTH_BROWSER_TEST=1 PORT=55462
# Tạo volume riêng mới; khi chạy lại volume, dùng đúng PGUSER/PGPASSWORD đã tạo.
docker compose -p shanity-browser-test up -d --wait postgres
pnpm --filter api db:migrate
pnpm --filter api build
node apps/api/test/browser-server.mjs
```

Terminal thứ hai:

```bash
NEXT_PUBLIC_API_URL=http://localhost:55462 pnpm --filter web build
pnpm --filter web start --port 55461
```

Terminal thứ ba, có các PG* của DB thử và AUTH_BROWSER_TEST=1:

```bash
# Dùng Chrome có sẵn, hoặc pnpm --filter web exec playwright install chromium
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome
pnpm --filter web test:e2e
```

Fixture server là NestJS thật với PostgreSQL thật, nhưng override GoogleProvider trong **file test riêng**; phải có NODE_ENV=test/AUTH_BROWSER_TEST=1/DB *_test mới khởi động. Frontend và API sản phẩm không có test switch. Browser test thay hop Google bằng phản hồi provider giả, vẫn chạy backend state/cookie/callback/link/session thật. Trace tắt, ảnh lỗi và report bị gitignore. Sau thử, dừng các process và `docker compose -p shanity-browser-test down` (giữ volume).

## Google thật và phần chưa triển khai

Bộ test tự động không đăng nhập vào tài khoản Google thật. Chưa xác minh consent và đổi authorization code thật với cấu hình Google Cloud. Để nghiệm thu: chạy ứng dụng tại origin khớp cấu hình, bấm Tiếp tục với Google, đăng nhập/test-user được cho phép, chấp thuận, xác nhận về `/profile`; logout rồi đăng nhập lại, hủy consent và thử liên kết từ profile. Không gửi code/token/secret trong hội thoại.

Chưa có xác minh email, reset mật khẩu, cấp quyền giảng viên/admin qua UI, dashboard theo vai trò hoặc danh sách tài khoản Google đã liên kết (backend chưa có endpoint liệt kê). Quy trình cấp quyền vẫn theo quản trị tin cậy hiện hành.

## Kết quả xác minh lần triển khai này

- Backend build/lint thành công; 7 unit test và 14 e2e test PostgreSQL qua với hợp đồng callback redirect mới.
- Frontend lint/build thành công; 7 Playwright test qua trên Chrome hệ thống, web `localhost:55461`, API `localhost:55462`, PostgreSQL test port 55442.
- Đã kiểm tra đăng ký → hồ sơ → sửa tên → reload → logout → login; sai mật khẩu, email trùng, disabled; bảo vệ trang; refresh đồng thời hai tab chỉ có 1 POST refresh; revoke phiên chuyển về login; đồng bộ login/logout nhiều tab; student bị 403 ở admin endpoint; gửi form lặp chỉ có 1 POST register.
- Google lần đầu/lần sau, liên kết tài khoản, callback hủy/lỗi đi qua backend thật nhưng dùng GoogleProvider fixture. Không coi đây là nghiệm thu Google thật; chưa thực hiện consent và đổi code thật.
- Regression đã phát hiện và sửa: BroadcastChannel dùng hai object trong cùng tab làm tab tự nhận sự kiện của mình, remount form và mất thông báo lưu. Hiện tái sử dụng một channel để chỉ các tab khác nhận sự kiện. Profile editor được key theo user ID để không giữ bản nháp khi đổi tài khoản.
- Không chạy hoặc sửa database production. Container/process test đã dừng, volume dữ liệu test được giữ. Không commit secret, screenshot lỗi hoặc trace.

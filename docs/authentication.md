# Tài khoản và xác thực

Phạm vi: đăng ký/đăng nhập, phiên, Google OAuth, hồ sơ, đổi mật khẩu, avatar, và cách web bảo vệ route. Ma trận quyền ở [permissions](permissions.md); quản trị người dùng ở [admin](admin.md).

## Mô hình phiên

- **Cookie HttpOnly cho cả access JWT và refresh token.** Frontend không đọc hay lưu token vào `localStorage`/`sessionStorage`; mọi `fetch` dùng `credentials: 'include'`.
- Tên cookie: production dùng tiền tố `__Host-` (Secure, HttpOnly, SameSite=Lax, Path=/, không có Domain); local dùng `shanity_access`, `shanity_refresh`.
- **Access token** là JWT HS256 (`iss`, `aud`, `exp`, `sub`, `sid`), **không chứa role**. Mỗi request được bảo vệ tra phiên, trạng thái người dùng và role hiện tại trong database, nên logout, khóa tài khoản hay thu hồi quyền có hiệu lực ngay với token đã cấp.
- **Refresh token** là 32 byte ngẫu nhiên; database chỉ lưu SHA-256. Refresh khóa hàng phiên (`FOR UPDATE`) và thay hash trong một transaction: hai request cùng token chỉ một thành công, token cũ trả 401. Phiên có hạn **tuyệt đối** tính từ lúc đăng nhập (`AUTH_REFRESH_SECONDS`), refresh không kéo dài thêm. Logout thu hồi phiên ứng với refresh cookie và xóa cookie. Token không bao giờ xuất hiện trong JSON hay URL.
- **CSRF**: mọi `POST/PATCH/PUT/DELETE` phải có header `Origin` khớp `WEB_ORIGIN` (`OriginGuard`), kể cả login/register/logout; `Origin` thiếu hoặc `null` bị từ chối. Cùng SameSite=Lax, điều này chặn CSRF và login CSRF. Script/curl phải tự gửi `Origin`.
- **Cùng site**: web và API công khai phải cùng scheme và miền gốc (có thể khác cổng/origin) vì cookie là host-only. Mô hình khác site cần thiết kế cookie/CSRF riêng và chưa được hỗ trợ; không nới SameSite hay Domain để né.
- **Giới hạn tần suất**: các route auth giới hạn 10 request/phút/IP/handler (lưu trong PostgreSQL), trả 429 + `Retry-After: 60`, áp dụng cả khi đầu vào không hợp lệ. Limiter dùng IP socket và không tin `X-Forwarded-For` từ client; khi đặt sau proxy cần cấu hình proxy tin cậy. Cần điều chỉnh theo NAT trường học trước khi tải lớn.
- **Mật khẩu**: scrypt của Node (N=131072, r=8, p=1, salt 16 byte), so sánh hằng-thời-gian, có hash giả cho email không tồn tại để tránh lộ thời gian phản hồi. Độ dài 12–128 ký tự. Email được trim và lowercase; unique trong database.

## API xác thực

| Endpoint | Yêu cầu | Kết quả |
| --- | --- | --- |
| `POST /auth/register` | `email`, `password` (12–128), `displayName` (1–100) | 201 + cookie; email trùng 409. Luôn cấp vai trò `student`; gửi `role` bị 400 |
| `POST /auth/login` | `email`, `password` | 200 + cookie; sai thông tin hoặc tài khoản bị khóa đều 401 `Invalid credentials` |
| `POST /auth/refresh` | refresh cookie | 200 + cookie mới; hết hạn/thu hồi/token cũ 401 |
| `POST /auth/logout` | refresh cookie (nếu có) | 204, idempotent |
| `GET /auth/google` | điều hướng trình duyệt | 302 tới Google |
| `POST /auth/google/link` | phiên hợp lệ | URL Google để liên kết tài khoản hiện tại |
| `GET /auth/google/callback` | `code`/`state` hoặc lỗi từ Google | cookie phiên rồi 302 về `WEB_ORIGIN/auth/callback` |
| `GET /users/me` | phiên | `id`, `email`, `displayName`, `roles`, `avatarUrl`, `hasPassword` |
| `PATCH /users/me` | phiên; chỉ `displayName` | hồ sơ đã cập nhật |
| `PATCH /users/me/password` | phiên; `currentPassword`, `newPassword` | 204, xóa cookie (xem dưới) |
| `POST /users/me/avatar`, `DELETE /users/me/avatar` | phiên | người dùng đã cập nhật (xem dưới) |
| `GET /avatars/:key` | công khai | ảnh WebP |
| `GET /users/admin-check` | role `admin` hiện tại | 200 hoặc 403 |

DTO dùng whitelist + `forbidNonWhitelisted`: gửi `role`, `status`, `id`, `email`, `password`… qua cập nhật hồ sơ đều trả 400. Lỗi theo cấu trúc `HttpException` của Nest; lỗi nội bộ trả 500 chung, không lộ SQL hay lỗi của nhà cung cấp.

Thử nhanh bằng curl (cookie jar là credential thật, xóa sau khi dùng):

```bash
curl -i -c /tmp/jar -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  http://localhost:4000/auth/register \
  --data '{"email":"student@example.test","password":"mot-mat-khau-dai-de-thu","displayName":"Học sinh"}'
curl -b /tmp/jar http://localhost:4000/users/me
curl -i -b /tmp/jar -c /tmp/jar -H 'Origin: http://localhost:3000' -X POST http://localhost:4000/auth/refresh
curl -i -b /tmp/jar -H 'Origin: http://localhost:3000' -X POST http://localhost:4000/auth/logout
rm /tmp/jar
```

## Google OAuth

- Tạo OAuth client loại *Web application*, đăng ký chính xác callback `<API>/auth/google/callback` (local: `http://localhost:4000/auth/google/callback`) — đây là callback **của backend**, không phải route `/auth/callback` của web. Đặt cả ba biến `GOOGLE_*`; để trống cả ba để tắt Google (route trả 503); cấu hình thiếu một phần hoặc sai đường dẫn callback khiến API không khởi động.
- Dùng authorization code flow với PKCE S256, `state` ngẫu nhiên (lưu hash phía server, hết hạn 10 phút, tiêu thụ nguyên tử một lần) kèm cookie trình duyệt và `nonce`. `google-auth-library` xác minh chữ ký ID token, issuer, hạn và audience; ứng dụng kiểm tra `nonce` và `email_verified === true`. Request tới Google có timeout 10 giây. Không lưu token Google.
- Đăng nhập tìm theo `unique(provider, provider_subject)`. Nếu email đã thuộc tài khoản khác chưa liên kết, trả 409 và **không tự liên kết**; người dùng đăng nhập tài khoản cũ rồi gọi `POST /auth/google/link`. Callback liên kết yêu cầu access cookie vẫn thuộc đúng phiên đã khởi tạo, phiên còn hiệu lực và tài khoản active. Một danh tính Google không thể thuộc hai người dùng (advisory lock theo `subject` và unique constraint).
- Kết quả luôn chuyển về `WEB_ORIGIN/auth/callback`: `?result=signed_in|linked` hoặc `?error=cancelled|account_conflict|rate_limited|unavailable|failed`. Không có token/code/secret trong URL. Frontend không coi query string là bằng chứng đăng nhập: nó luôn gọi `/users/me` bằng cookie. `OAuthRedirectFilter` bảo đảm lỗi của các route GET này (kể cả rate limit) cũng quay về frontend theo allowlist mã lỗi.
- Tài khoản email-password mới chưa được coi là email đã xác minh; không dùng làm bằng chứng liên kết OAuth.

## Hồ sơ, mật khẩu và avatar

**Hồ sơ.** Chỉ `displayName` (trim, 1–100 ký tự, không toàn khoảng trắng) tự sửa được. Email là danh tính đăng nhập và chỉ đọc. Đích cập nhật luôn lấy từ `req.principal.id`, không bao giờ từ body/URL.

**Đổi mật khẩu** (`PATCH /users/me/password`, dùng `OriginGuard`, `SessionGuard`, `AuthRateGuard`). Service khóa phiên rồi người dùng trong một transaction (cùng thứ tự với refresh), xác minh mật khẩu hiện tại, từ chối dùng lại mật khẩu cũ, cập nhật `password_hash` và thu hồi **phiên hiện tại** trong cùng transaction. Trả 204 và xóa cookie; các phiên khác vẫn hoạt động. Web đưa người dùng về `/login?passwordChanged=1` (cờ chỉ để hiển thị thông báo). Tài khoản chỉ có Google (`hasPassword: false`) bị từ chối với 400 miền riêng và UI vô hiệu hóa hành động.

**Avatar** (`POST/DELETE /users/me/avatar`, `GET /avatars/:key`):

- Tối đa 2 MiB; JPEG/PNG/WebP. `sharp` giải mã để xác minh nội dung khớp MIME (không tin phần mở rộng hay tên tệp), giới hạn 16 triệu điểm ảnh, từ chối ảnh nhiều trang, áp dụng hướng EXIF, xóa metadata, co vừa 512 × 512 (không phóng to) rồi mã hóa lại WebP.
- Khóa lưu là UUID sinh phía server (`users.avatar_key`); bytes nằm trên đĩa (`AVATAR_STORAGE_DIR`, Compose dùng volume `avatar_data`), không nằm trong PostgreSQL. Khi thay/xóa, hàng người dùng bị khóa để tuần tự hóa; tệp mới được ghi trước, tệp cũ bị xóa sau khi commit; commit lỗi thì xóa tệp mới. Chỉ khóa đúng định dạng UUID/WebP mới bị xóa.
- Ảnh được phục vụ công khai (`image/webp`, `nosniff`, cache immutable) và URL đổi theo mỗi lần tải lên. Hộp thoại nói rõ ảnh công khai với ai có URL. Đây là lưu trữ cục bộ cho một instance API có đĩa bền; nhiều instance cần lưu trữ dùng chung hoặc thay `AvatarStorage` bằng object storage. Sao lưu volume cùng PostgreSQL.

## Phiên và bảo vệ route ở web

- `lib/api.ts`: `fetch` với `credentials: 'include'`, `no-store`, timeout 15 giây, `ApiError` (mang `correlationId`); khi gặp 401 tự gọi refresh và thử lại đúng một lần. Không đọc `document.cookie`.
- `features/auth/session-provider.tsx` giữ hồ sơ **chỉ trong bộ nhớ**, tải bằng API khi mở/focus/đổi tab. Bộ đếm thế hệ ngăn phản hồi cũ khôi phục trạng thái sau logout. `BroadcastChannel` chỉ phát sự kiện `changed/logout` (không có token). Refresh dùng một promise chung trong tab và **Web Locks** giữa các tab: khi lấy được lock, client kiểm tra `/users/me` trước, nếu tab khác đã refresh thì dùng cookie mới thay vì xoay thêm lần nữa.
- **Route được bảo vệ**: `src/proxy.ts` chuyển hướng 307 tới `/login?redirect=…` khi thiếu access cookie (chỉ kiểm tra *có mặt*, không coi là bằng chứng); sau đó server layout/page gọi `requireUser()`/`requireRole()` để xác minh thật với `GET /users/me`. Cookie giả, hết hạn, tài khoản bị khóa hay phiên bị thu hồi đều bị đưa về login; lỗi mạng/5xx fail-closed qua error boundary. Khi thêm data loader hoặc server action mới, gọi `requireUser()` ngay trước thao tác; thêm route bảo vệ mới vào matcher của proxy.
- **Return URL**: `safeRedirect()` chỉ nhận đường dẫn cùng origin, chặn URL tuyệt đối, `//`, backslash, ký tự điều khiển, dạng encode và các đường dẫn auth có thể gây vòng lặp; mặc định `/profile`. Với Google, chỉ **URL đích** được giữ trong `sessionStorage` của tab, được kiểm tra lại và xóa sau callback.
- **Cổng đăng nhập quản trị** `/admin/login` (nhóm route `(admin-auth)`, công khai trong proxy) dùng giao diện riêng, không có đăng ký/OAuth. Nó vẫn dùng `POST /auth/login` và chỉ cho đi tiếp khi `/users/me` có role phù hợp; đăng nhập đúng nhưng không phải admin hiển thị thông báo từ chối truy cập và không cấp quyền quản trị. Đây là tách biệt UI/route, không phải hai hệ phiên. Đích sau đăng nhập phải nằm trong `/admin`; logout ở header quản trị về `/admin/login`.
- Người dùng đã đăng nhập nhưng thiếu quyền được chuyển tới `/forbidden`; nhân viên tài chính vào `/admin` được đưa tới `/admin/orders`.
- Biến `API_INTERNAL_URL` dùng cho các lời gọi từ server Next tới API (mặc định lấy `NEXT_PUBLIC_API_URL`; Compose đặt `http://api:4000`). Không dùng `localhost` để gọi container khác.

## Vận hành và giới hạn

- Đã có: đăng ký, đăng nhập, refresh/logout, Google, đổi mật khẩu, hồ sơ, avatar, quản trị tài khoản.
- **Chưa có**: xác minh email, quên/đặt lại mật khẩu, đổi email, MFA, danh sách phiên, đăng xuất mọi thiết bị, danh sách danh tính Google đã liên kết. Không có replay-family revocation tự động: token refresh cũ trả 401, phiên mới vẫn hợp lệ nên frontend phải tuần tự hóa refresh.
- Hàng `oauth_requests`, `auth_rate_limits` và phiên cũ hết hạn chưa được dọn tự động; cần tác vụ định kỳ với retention được chốt. Cần giám sát tải scrypt và pool PostgreSQL, chống brute force đa IP, HTTPS và redaction log ở hạ tầng.
- Mở lại tài khoản bị khóa có thể cho phép dùng lại phiên chưa hết hạn/chưa thu hồi; quy trình vô hiệu hóa lâu dài nên đồng thời thu hồi mọi phiên.
- **Nghiệm thu Google thật** chưa được tự động hóa: test tự động mock provider ở ranh giới xác minh danh tính. Cần credential hợp lệ, test user và thao tác trình duyệt: mở `GET /auth/google` trên origin API khớp callback, đăng nhập, xác nhận về `/profile`, kiểm tra cookie HttpOnly và `GET /users/me`.

## Kiểm thử

Dùng database thử riêng (tên kết thúc `_test`), không reset dữ liệu sẵn có:

```bash
pnpm --filter api db:migrate
pnpm --filter api test            # unit: Google verifier (nonce, audience, email_verified…)
pnpm --filter api test:e2e        # PostgreSQL thật: refresh đồng thời, hết hạn, revoke, disabled, CSRF, rate limit, liên kết Google
pnpm --filter web test:e2e        # Playwright: tests/auth.spec.ts, tests/admin-redirect.spec.ts
```

E2E tạo email ngẫu nhiên và dùng định danh rate-limit riêng mỗi lần chạy. Fixture của Playwright là NestJS thật + PostgreSQL thật nhưng thay `GoogleProvider` bằng bản giả trong tệp test riêng; fixture chỉ khởi động khi có `NODE_ENV=test`/`AUTH_BROWSER_TEST=1` và database `*_test`. Xem [testing](testing.md).

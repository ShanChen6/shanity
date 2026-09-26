# Auth + User

## Phạm vi và cấu hình

NestJS tiếp tục dùng Knex + pg. Migration `202609270004_auth.mjs` thêm `users.status` (active/disabled), `auth_sessions`, `oauth_requests`, `auth_rate_limits`. Người dùng cũ giữ nguyên dữ liệu, mặc định active; không tự gán role cho tài khoản cũ. Tài khoản mới qua email hoặc Google nhận student trong cùng transaction. Không thay migration cũ.

```bash
cp .env.example .env
openssl rand -hex 32
# Gán kết quả vào JWT_SECRET; thay PGPASSWORD. Không commit .env.
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm --filter api db:migrate
pnpm dev:api
```

API kiểm tra secret, thời hạn và URL khi khởi động. `JWT_ACCESS_SECONDS` từ 60–900 (mẫu 900); `AUTH_REFRESH_SECONDS` từ 600–2592000 (mẫu 30 ngày). `JWT_SECRET` tối thiểu 32 byte, phải là giá trị ngẫu nhiên. WEB_ORIGIN là origin frontend chính xác, không chứa path/query. File `.env.example` dùng localhost cho phát triển.

Compose: `docker compose up --build -d`. Mẫu `.env` đặt `API_NODE_ENV=development` để thử qua HTTP localhost. Khi triển khai thật đặt `API_NODE_ENV=production`, `WEB_ORIGIN=https://...`, `GOOGLE_CALLBACK_URL=https://...` và đặt API sau HTTPS reverse proxy. HTTPS bắt buộc cho cấu hình production. Không chuyển production thành development để bỏ qua yêu cầu HTTPS.

## API và cookie

Frontend hiện là trang Next.js mẫu, chưa có giao diện auth. Backend chọn cookie HttpOnly cho cả JWT và refresh token; frontend không đọc/lưu token vào localStorage hoặc sessionStorage. Gọi fetch với `credentials: 'include'`; triển khai web/API cùng site (cùng scheme và miền gốc), có thể khác origin. CORS chỉ cho WEB_ORIGIN với credentials. Mô hình khác site cần thiết kế cookie/CSRF riêng, chưa được hỗ trợ.

Cookie production dùng tiền tố `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/, không có Domain. Local dùng `shanity_access`, `shanity_refresh`. Access JWT HS256 có iss/aud/exp/sub/sid; không chứa role. Mỗi request bảo vệ tra phiên, trạng thái user và role hiện tại trong DB: logout, khóa tài khoản hoặc thu hồi admin có hiệu lực với access token đã cấp. Việc mở lại tài khoản có thể cho phép dùng lại phiên chưa hết hạn/chưa bị thu hồi; quy trình vô hiệu hóa lâu dài nên đồng thời thu hồi tất cả phiên.

Refresh token là 32 byte ngẫu nhiên; DB chỉ lưu SHA-256. Refresh khóa hàng session bằng FOR UPDATE và thay hash trong transaction; hai request cùng token chỉ một thành công. Token cũ không dùng được. Phiên có hạn tuyệt đối từ lúc đăng nhập (không kéo dài khi refresh), cookie không vượt quyền hạn DB. Logout thu hồi phiên tương ứng refresh cookie và xóa cookie. Không có replay-family revocation tự động: token cũ trả 401, phiên mới vẫn hợp lệ; frontend phải tuần tự hóa refresh, tránh chạy song song nhiều tab/request. Refresh token không bao giờ được trả trong JSON hoặc URL.

Mọi POST/PATCH yêu cầu header Origin khớp WEB_ORIGIN, kể cả login/register/logout. Kết hợp kiểm tra Origin phía server với SameSite để chặn CSRF và login CSRF; không chấp nhận Origin thiếu/null. Các route GET không sửa dữ liệu người dùng, ngoại trừ callback OAuth được bảo vệ bằng state/browser cookie dùng một lần. Client script/curl phải tự gửi Origin. Không bật trust proxy tùy ý; limiter dùng socket IP, không tin X-Forwarded-For từ client. Khi thêm proxy cần cấu hình đúng các proxy tin cậy để tránh cả site dùng chung giới hạn.

| Endpoint | Đầu vào / yêu cầu | Kết quả |
| --- | --- | --- |
| POST /auth/register | email, password (12–128 ký tự), displayName (1–100) | 201 và cookie; email trùng 409 |
| POST /auth/login | email, password | 200 và cookie; sai/khóa tài khoản đều 401 Invalid credentials |
| POST /auth/refresh | refresh cookie | 200 và cookie mới; hết hạn/thu hồi/token cũ 401 |
| POST /auth/logout | refresh cookie nếu có | 204; idempotent |
| GET /users/me | access cookie hợp lệ | id, email, displayName, roles |
| PATCH /users/me | access cookie; chỉ displayName | hồ sơ đã cập nhật |
| GET /users/admin-check | access cookie và role admin hiện tại | 200 hoặc 403 |
| GET /auth/google | điều hướng trình duyệt | chuyển đến Google |
| POST /auth/google/link | access cookie, Origin | URL Google để điều hướng liên kết |
| GET /auth/google/callback | code/state hoặc lỗi provider | cookie phiên và chuyển về WEB_ORIGIN; link thành công giữ phiên hiện tại |

DTO whitelist + forbidNonWhitelisted trả 400 cho role/status/id/password gửi qua cập nhật hồ sơ hoặc role gửi khi đăng ký. Email trim/lowercase, unique DB chống đua. Mật khẩu dùng Node scrypt (N=131072, r=8, p=1, salt ngẫu nhiên 16 byte), so sánh constant-time, có hash giả cho email không tồn tại. Không trả password/hash. Hash hiện hữu không đúng định dạng scrypt sẽ không đăng nhập được; cần quy trình migration hash/reset riêng nếu có dữ liệu nhập ngoài.

Lỗi theo cấu trúc HttpException của Nest (statusCode/message/error nếu có). Lỗi nội bộ trả 500 chung; filter không ghi raw SQL/provider error vì có thể chứa dữ liệu nhạy cảm. Không bật SQL debug hoặc log request body/cookie/Authorization/query callback ở proxy/APM. Các route auth giới hạn 10 request/phút/IP/handler trong PostgreSQL, trả 429 và Retry-After=60; áp dụng cả khi input không hợp lệ. Giới hạn này bảo vệ cơ bản; cần điều chỉnh theo NAT trường học và bổ sung lớp chống lạm dụng theo tài khoản trước tải lớn.

### Thử email trên máy

```bash
curl -i -c /tmp/shanity-cookie.txt -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' http://localhost:4000/auth/register \
  --data '{"email":"student@example.test","password":"your-own-long-test-password","displayName":"Học sinh"}'
curl -b /tmp/shanity-cookie.txt http://localhost:4000/users/me
curl -i -b /tmp/shanity-cookie.txt -c /tmp/shanity-cookie.txt \
  -H 'Origin: http://localhost:3000' -X POST http://localhost:4000/auth/refresh
curl -i -b /tmp/shanity-cookie.txt -H 'Origin: http://localhost:3000' \
  -H 'Content-Type: application/json' -X PATCH http://localhost:4000/users/me \
  --data '{"displayName":"Tên mới"}'
curl -i -b /tmp/shanity-cookie.txt -H 'Origin: http://localhost:3000' -X POST http://localhost:4000/auth/logout
rm /tmp/shanity-cookie.txt
```

Cookie jar là credential thật, chỉ dùng local và xóa sau kiểm thử. Không chép đầu ra Set-Cookie vào log công khai.

## Google OAuth

Tạo OAuth client loại Web application trong Google Cloud, cấu hình consent screen và test users. Đăng ký chính xác callback (local: `http://localhost:4000/auth/google/callback`), đặt GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL. Có thể để cả ba trống khi chạy email-only; route bắt đầu Google trả 503. Cấu hình thiếu một phần khiến startup thất bại.

Dùng authorization code flow, PKCE S256, state + cookie browser ngẫu nhiên và nonce; state hash lưu server, hết hạn 10 phút, tiêu thụ nguyên tử một lần. `google-auth-library` đổi code và xác minh chữ ký ID token, issuer, expiry, audience; ứng dụng kiểm tra nonce và email_verified. Không lưu token Google; verifier/state tạm thời không phải refresh credential. Chỉ redirect về origin cấu hình, không nhận return URL tùy ý. Tham khảo [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

Đăng nhập Google tìm theo unique(provider,provider_subject). Nếu email đã thuộc tài khoản khác nhưng chưa liên kết thì trả 409, không auto-link. Người dùng đăng nhập tài khoản cũ rồi POST /auth/google/link, điều hướng đến URL trả về; callback yêu cầu access cookie vẫn thuộc đúng phiên đã khởi tạo liên kết, phiên chưa bị thu hồi/hết hạn và tài khoản active. Nếu đổi tài khoản, mất cookie hoặc access token hết hạn trong lúc consent, phải làm mới/đăng nhập lại rồi khởi tạo một yêu cầu liên kết mới. Một Google identity không thể thuộc hai user; transaction advisory lock theo Google subject tuần tự hóa callback đăng nhập/liên kết trên nhiều API instance, và unique constraint vẫn bảo vệ dữ liệu. Hai callback đăng nhập đầu tiên cho cùng subject dùng chung một user; hai tài khoản tranh liên kết thì chỉ một thành công. Người dùng hủy, state giả/hết hạn/tái sử dụng hoặc ID token sai trả 401. Xung đột identity/email trả 409. Bản này chưa có giao diện hiển thị lỗi OAuth, callback lỗi trả JSON theo API.

## Mở rộng quyền và vận hành

`SessionGuard`, `Roles` và `Principal` là điểm tích hợp cho API tiếp theo; AuthModule export guard/service. `@Roles('admin')` dùng cùng SessionGuard; role đọc từ DB. Guard tài nguyên tiếp theo dùng principal.id để kiểm tra courses.owner_id, course_instructors hoặc enrollment còn hiệu lực; không suy ra quyền tài nguyên chỉ từ role. Ma trận tại [permissions.md](permissions.md) vẫn áp dụng.

Chưa có endpoint cấp role/khóa tài khoản: chỉ quy trình quản trị tin cậy qua DB có kiểm soát. Không có seed admin. Trước khi làm giao diện quản trị cần chốt ai được cấp instructor/admin, bằng chứng phê duyệt, audit và quyền thu hồi. Chưa triển khai xác minh email, quên/reset mật khẩu, đổi email/mật khẩu, MFA, danh sách phiên và logout mọi thiết bị. Email-password mới chưa được coi là email đã xác minh; không dùng email đó làm bằng chứng liên kết OAuth hoặc thao tác nhạy cảm.

Các hàng oauth_requests/rate limit hết hạn và phiên cũ cần tác vụ dọn định kỳ với retention được chốt; bản này chỉ kiểm tra expiry, không tự xóa lịch sử. Cần giám sát tải scrypt/pool PostgreSQL, chống brute force đa IP, HTTPS và redaction log tại hạ tầng.

## Kiểm thử

Dùng database thử nghiệm riêng, không reset dữ liệu có sẵn. Ví dụ export PGDATABASE trỏ DB thử đã tạo, PGPASSWORD, PGPORT và cấu hình JWT/WEB_ORIGIN như trên rồi:

```bash
pnpm --filter api db:migrate
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
```

E2E tạo email ngẫu nhiên, giữ dữ liệu thử và không reset DB; rate-limit identity riêng mỗi lần chạy. GoogleProvider được mock trong e2e để kiểm tra state/link/race constraint và phiên; unit test kiểm tra từ chối lỗi verifier, nonce sai, email chưa xác minh. Không gọi Google thật từ test tự động. Nghiệm thu Google thật cần credential hợp lệ, consent/test user và thao tác trình duyệt; chưa thể xác minh end-to-end với Google nếu chưa cung cấp cấu hình này.

### Kết quả thực tế trong lần triển khai

- `pnpm --filter api build`, `lint`: thành công.
- `pnpm --filter api test`: 5 test qua; `test:e2e`: 8 test qua với PostgreSQL thật, gồm refresh đồng thời, hết hạn, revoke, disabled, quyền admin hiện hành, DTO, CSRF, rate limit và liên kết Google.
- `db:migrate`: cả 4 migration chạy trên DB trống `shanity_auth_test`; chạy lần hai báo Already up to date. `db:verify` qua các ràng buộc nền tảng.
- Nâng cấp volume thử nghiệm giai đoạn trước từ migration 003 lên 004 thành công, khóa demo giữ nguyên. Lần đầu bị `password authentication failed for user shanity_user` vì PGUSER kế thừa `.env`; đã chạy lại với PGUSER/PGDATABASE của volume cũ được chỉ định rõ. Không sửa `.env` hoặc database của người dùng.
- `docker compose -p shanity-auth-verification build api`: thành công (Dockerfile build cả API và web, Node 24, frozen lockfile).
- Image build chạy trên port 55443, PostgreSQL riêng port 55442: HTTP register → me → refresh → logout → 401 thành công. Không in token/credential khi kiểm tra. Container thử nghiệm đã dừng, volume được giữ.
- Chưa thử consent/callback trực tiếp với Google thật; cần OAuth client credentials và test user. Các test OAuth tự động mock provider ở ranh giới xác minh danh tính, không thay thế nghiệm thu với Google.


### Kiểm chứng Google OAuth bổ sung

- Ba biến Google đã được cấu hình; kiểm tra chỉ in trạng thái có/không, không in secret. Callback cấu hình khớp `/auth/google/callback`; startup giờ từ chối callback path khác route backend.
- Dùng backend đã build với cấu hình Google hiện có: GET /auth/google trả redirect chứa đúng client ID/callback/PKCE; callback hủy đăng nhập trả 401 và no-store. Không cần frontend cho phép thử này.
- Request tới provider có timeout 10 giây. email_verified phải là boolean true.
- Build và lint qua; 7 unit test và 14 e2e test PostgreSQL qua. Unit test dùng JWT ký RSA cục bộ để chạy bộ xác minh chữ ký Google thật (cert/token exchange được thay bằng fixture), kiểm tra chữ ký sai, audience/issuer sai, token hết hạn, nonce sai và email chưa xác minh. E2E bổ sung state hết hạn/sai browser, đổi phiên, revoke/disabled, đăng nhập lại, liên kết lặp và callback đồng thời.
- Không sửa schema hoặc frontend trong lần bổ sung này. Không chỉnh `.env` hoặc ghi credential vào log. PostgreSQL test riêng, không reset dữ liệu; container đã dừng và giữ volume.
- Chưa thực hiện consent bằng tài khoản Google thật và đổi authorization code thật. Cấu hình có đủ không chứng minh Google Cloud đã cho phép chính xác redirect URI/consent user; bước nghiệm thu cuối cần người dùng mở GET /auth/google trên origin API khớp callback, đăng nhập Google và chấp thuận. Kiểm tra cookie HttpOnly được cấp và GET /users/me trả tài khoản; không gửi code/token/secret vào hội thoại.

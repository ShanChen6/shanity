# Triển khai và vận hành

## Docker

`Dockerfile` nhiều giai đoạn (Node 24 Alpine, pnpm 11.24.0 qua Corepack, `pnpm install --frozen-lockfile`):

| Giai đoạn | Nội dung |
| --- | --- |
| `base` / `dependencies` | Corepack + cài dependency theo lockfile |
| `build` | Nhận các build arg `NEXT_PUBLIC_*`, build cả API (`nest build`) và web (`next build`) |
| `api` (target) | `NODE_ENV=production PORT=4000`, chạy `node dist/main.js`; chứa `apps/api/database` (CLI migrate/seed) |
| `web` (target) | `NODE_ENV=production PORT=3000`, chạy `next start --hostname 0.0.0.0` |

`compose.yaml`:

| Service | Vai trò |
| --- | --- |
| `postgres` | PostgreSQL 17, healthcheck `pg_isready`, volume `postgres_data`, chỉ bind `127.0.0.1:${PGPORT}` |
| `redis` | **Tùy chọn** (`COMPOSE_PROFILES=cache`): cache thuần — không lưu đĩa, giới hạn 128 MB, loại bỏ LRU. API vẫn chạy khi Redis vắng hay chết |
| `migrate` | Chạy một lần: `node database/cli.mjs migrate && node database/cli.mjs seed-admin`; cần `SUPER_ADMIN_EMAIL/PASSWORD` |
| `api` | Chờ `postgres` healthy và `migrate` hoàn tất; volume `avatar_data` tại `/data/avatars`; cổng `${API_PORT:-4000}` |
| `web` | Cổng `${WEB_PORT:-3000}`; `API_INTERNAL_URL=http://api:4000` cho lời gọi phía server |

```bash
cp .env.example .env     # PGPASSWORD, JWT_SECRET, WEB_ORIGIN, SUPER_ADMIN_* là bắt buộc
docker compose up --build -d
docker compose logs -f migrate api
```

- Cổng trong container luôn là 3000/4000; chỉ cổng host đổi (`WEB_PORT`, `API_PORT`, `PGPORT`).
- `NEXT_PUBLIC_*` là **build args** — đổi giá trị phải build lại image web (`docker compose build web`).
- Service `api` trong `compose.yaml` hiện chỉ chuyển tiếp các biến: database, `SUPER_ADMIN_*`, `JWT_*`/`AUTH_REFRESH_SECONDS`, `WEB_ORIGIN`, `LOG_LEVEL`, `REDIS_URL`, `CACHE_PUBLIC_CATALOG_SECONDS`, `LEGACY_ROUTES_*`, `GOOGLE_*`, `CLOUDINARY_*` và `AVATAR_STORAGE_DIR`. Các biến còn lại (VietQR/webhook ngân hàng, Stripe, Pusher, kiểm duyệt bình luận, lớp trực tiếp, `STORAGE_DRIVER`/`MEDIA_SIGNING_SECRET`/`MAX_VIDEO_SIZE_MB`) **không** được chuyển tiếp: nếu dùng Compose phải thêm chúng vào `environment` của service `api`.
- Chỉ có volume cho PostgreSQL và avatar. Thư mục media bài học (`uploads/lessons` mặc định, hoặc `LESSON_MEDIA_STORAGE_DIR`) **không** nằm trên volume trong Compose, nên video/tài liệu tải lên sẽ mất khi container bị thay; hãy mount một volume cho thư mục này trước khi dùng tính năng tải lên ở môi trường cần giữ dữ liệu.
- `docker compose down` giữ volume; **không dùng `down -v`** nếu cần giữ dữ liệu. Đổi `POSTGRES_*` không sửa database đã khởi tạo trong volume.
- Dockerfile/Compose chưa được kiểm tra bằng test tự động; trước khi phát hành thay đổi chúng hãy chạy `docker compose config` và `docker compose --profile cache build && up`.

## Danh sách kiểm tra production

**Mạng và cookie**

- Đặt API sau HTTPS (reverse proxy) với `API_NODE_ENV=production`; `WEB_ORIGIN` và `GOOGLE_CALLBACK_URL` dùng `https://`. HTTPS là bắt buộc ở production; không đổi sang `development` để né.
- Cookie là host-only (`__Host-`), SameSite=Lax: **web và API công khai phải cùng hostname** (ví dụ proxy các route `/auth/*`, `/users/*`, `/api/*`… của NestJS về cùng origin, giữ `/auth/callback` cho Next). Hai subdomain khác nhau chưa đủ cho server guard; không nới `Domain` hay SameSite.
- Đăng ký `GOOGLE_CALLBACK_URL` (callback của backend) trong Google Cloud nếu bật Google.
- Không tin `X-Forwarded-For` từ client: khi đặt sau proxy cần cấu hình proxy tin cậy, nếu không giới hạn tần suất sẽ dùng chung IP của proxy cho cả site.
- Đặt `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` (và các `NEXT_PUBLIC_*` khác) **trước khi build web**.

**Bí mật và quyền**

- `JWT_SECRET` ngẫu nhiên ≥ 32 byte; `MEDIA_SIGNING_SECRET` độc lập; `BANK_WEBHOOK_API_KEY` dài và ngẫu nhiên (thiếu khóa thì webhook ngân hàng bị từ chối); `STRIPE_WEBHOOK_SECRET`, `PUSHER_SECRET`… chỉ trong môi trường API.
- Tài khoản database cho runtime ít quyền tách khỏi tài khoản migration; kết nối TLS theo hạ tầng.
- Điền `SUPER_ADMIN_*` và đổi mật khẩu sau lần đăng nhập đầu; không chạy `seed`/`seed-demo` (chúng từ chối ở production hoặc không dành cho production).
- Rà `/legal/terms`, `/legal/privacy` và điền `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ADDRESS` — hiện chỉ là khung nội dung.

**Dữ liệu**

- Chạy migration **trước** khi cập nhật API: `docker compose run --rm migrate`. Migration chạy dưới advisory lock nên an toàn khi nhiều tiến trình cùng thử.
- Sao lưu PostgreSQL (`pg_dump -Fc`) **và** các volume tệp: `avatar_data` và thư mục media bài học (`LESSON_MEDIA_STORAGE_DIR`); thử khôi phục định kỳ. Xem [database](database.md#sao-lưu-và-vận-hành).
- Dọn định kỳ `oauth_requests`, `auth_rate_limits`, phiên hết hạn và (khi có) thumbnail/tệp mồ côi — chưa tự động.

**Nhiều instance**

| Thành phần | Hành vi khi chạy nhiều instance API |
| --- | --- |
| Cache catalog | Mỗi instance có cache riêng nếu không có `REDIS_URL`; vô hiệu hóa bằng sự kiện chỉ tác động tới instance nhận sự kiện. Đặt `REDIS_URL` khi chạy nhiều instance |
| Rate limit chat/bình luận | Bộ nhớ trong tiến trình hoặc Redis (cùng `REDIS_URL`); rate limit auth nằm trong PostgreSQL nên chung cho mọi instance |
| Avatar, media bài học | Ghi ra đĩa cục bộ: cần volume dùng chung hoặc object storage (adapter `s3` hiện chưa hoàn thiện — xem [courses-and-lessons](courses-and-lessons.md#lưu-trữ-media)) |
| Worker thanh toán | Mỗi instance đều chạy; lượt quét idempotent nên an toàn nhưng có thể gọi cổng trùng |
| Chat | Pusher giữ kết nối, API không giữ socket |

## Quan sát và xử lý sự cố

- **Log**: JSON một dòng trên stdout (`LOG_LEVEL`); mọi dòng của một request mang `correlationId`. Người dùng thấy **mã tham chiếu** trên màn hình lỗi 5xx — tìm đúng giá trị đó trong log. Pipe qua `pino-pretty` khi phát triển nếu muốn màu. Log `LegacyRoute` (một lần mỗi route mỗi tiến trình) cho biết còn client nào gọi route cũ trước khi đặt `LEGACY_ROUTES_SUNSET`.
- **Sức khỏe**: `GET /health/db` (`SELECT 1` với timeout 5 giây; 503 chung khi lỗi); footer web poll nó mỗi 60 giây. `/admin/settings` hiển thị trạng thái dịch vụ và cấu hình thanh toán đang áp dụng.
- **Thanh toán**: theo dõi `webhook_logs` (`FAILED`), dòng sổ cái `FAILED` kèm payload thô (tiền về nhưng đơn không hoàn tất — cần hoàn tiền thủ công), và lỗi `Order expiration sweep failed` / lỗi worker đối soát. Bảng điều khiển `/admin/orders` cho nhân viên tài chính đối soát và hoàn tiền ([payments](payments.md)).
- Không bật SQL debug hay log body/cookie/`Authorization`/query callback ở proxy/APM.

## Gỡ route cũ (`/api/v1`)

Đặt `LEGACY_ROUTES_DEPRECATED_SINCE` để route gốc có alias bắt đầu trả `Deprecation` + `Link: …; rel="successor-version"`. Khi log `LegacyRoute` không còn người gọi, đặt `LEGACY_ROUTES_SUNSET` (sau ngày deprecation; sai định dạng thì API không khởi động) để chúng trả `410 Gone` kèm vị trí mới. `/auth/*`, `/health/*`, stream media/avatar có chữ ký không bị ảnh hưởng.

# Cấu hình và biến môi trường

Mọi biến được khai báo trong [`.env.example`](../.env.example) ở thư mục gốc; sao chép thành `.env` (không commit). Biến đã export trong shell luôn thắng file. API kiểm tra giá trị khi khởi động và **dừng ngay** nếu cấu hình sai thay vì chạy với cấu hình nguy hiểm.

`NEXT_PUBLIC_*` được Next.js nhúng vào bundle **lúc build**: với Docker chúng là build args (đã khai báo trong `Dockerfile` và `compose.yaml`), đổi giá trị thì phải build lại image web.

## Database

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `PGHOST`, `PGPORT` | `localhost`, `5432` | Địa chỉ PostgreSQL. Trong Compose, API luôn dùng `postgres:5432` |
| `PGUSER`, `PGDATABASE` | `shanity` | |
| `PGPASSWORD` | — (bắt buộc) | Compose từ chối khởi động nếu thiếu |

## Ứng dụng và cổng

| Biến | Mô tả |
| --- | --- |
| `PORT` | Cổng API khi chạy trực tiếp (mặc định 4000) |
| `API_PORT`, `WEB_PORT` | Chỉ ánh xạ cổng host của Compose (4000, 3000) |
| `API_NODE_ENV` | `NODE_ENV` của API trong Compose. `development` cho local qua HTTP; `production` khi có HTTPS |
| `WEB_ORIGIN` | Bắt buộc. Origin chính xác của web (không path/query). CORS và kiểm tra `Origin` dựa trên giá trị này; chỉ `http://localhost`/`127.0.0.1` được phép dùng HTTP và không phải ở production |
| `NEXT_PUBLIC_API_URL` | Origin công khai của API mà **trình duyệt** gọi (không dùng hostname nội bộ `api`). Nhúng lúc build |
| `NEXT_PUBLIC_SITE_URL` | Origin công khai của web, dùng cho `sitemap.xml`, `robots.txt`, canonical, Open Graph, JSON-LD. Đặt ở production, nếu không sẽ trỏ về localhost |
| `API_INTERNAL_URL` | Chỉ cho server Next gọi API (route guard). Compose đặt `http://api:4000`. Không có tiền tố `NEXT_PUBLIC_` |

## Xác thực

| Biến | Mặc định / giới hạn | Mô tả |
| --- | --- | --- |
| `JWT_SECRET` | ≥ 32 byte ngẫu nhiên, bắt buộc | `openssl rand -hex 32`. Giá trị placeholder chứa `replace-` bị từ chối |
| `JWT_ACCESS_SECONDS` | Bắt buộc, 60–900 (mẫu 900) | Hạn access token. Mã không có giá trị mặc định: chạy trực tiếp phải đặt (`.env.example` đã có; Compose mặc định 900) |
| `AUTH_REFRESH_SECONDS` | Bắt buộc, 600–2 592 000 (mẫu 2 592 000 = 30 ngày) | Hạn tuyệt đối của phiên |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | để trống cả ba | Để trống cả ba để tắt Google (route trả 503); thiếu một phần thì API không khởi động. Callback phải là `<API>/auth/google/callback` |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | — | Tài khoản quản trị ban đầu do seed tạo; bắt buộc trong Compose và production |

Chi tiết: [authentication](authentication.md).

## Lưu trữ tệp

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `AVATAR_STORAGE_DIR` | `uploads/avatars` (Compose: `/data/avatars`, volume `avatar_data`) | Thư mục ảnh đại diện |
| `STORAGE_DRIVER` | `local` | Lưu trữ media bài học: `local`, hoặc `s3` (hiện là bản dừng an toàn, mọi thao tác trả 503) |
| `LESSON_MEDIA_STORAGE_DIR` | `uploads/lessons` | Thư mục media bài học riêng tư; tách khỏi avatar |
| `MEDIA_SIGNING_SECRET` | rơi về `JWT_SECRET` | Khóa HMAC độc lập cho URL ký của media cục bộ |
| `MAX_VIDEO_SIZE_MB` | 2048 (1–2048) | Dung lượng tối đa video tải lên |
| `MEDIA_URL_TTL_SECONDS` | 3600 (3600–7200) | Thời hạn URL ký của video tải lên (không có trong `.env.example`) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | trống | Tệp đính kèm bài tự luận (upload ký trực tiếp từ trình duyệt). Trống = endpoint chữ ký trả 503 |

Chi tiết: [courses-and-lessons](courses-and-lessons.md#lưu-trữ-media).

## Thanh toán

| Biến | Mô tả |
| --- | --- |
| `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` | Tài khoản nhận tiền; thiếu → tạo QR trả 503 |
| `VIETQR_BANK_NAME` | Tên ngân hàng hiển thị (mặc định = `VIETQR_BANK_ID`) |
| `VIETQR_QR_FORMAT` | `vietqr` (img.vietqr.io, mặc định) hoặc `sepay` (qr.sepay.vn) |
| `BANK_WEBHOOK_API_KEY` | Khóa chia sẻ bắt buộc để chấp nhận webhook ngân hàng |
| `BANK_WEBHOOK_HMAC_SECRET` | Tùy chọn: yêu cầu thêm `x-signature` = HMAC-SHA256 của raw body |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Bật Stripe Checkout; để trống thì Stripe không khả dụng |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Địa chỉ cho nút "Liên hệ hỗ trợ" ở đơn lỗi (tùy chọn) |

Chi tiết: [payments](payments.md).

## Chat, blog và lớp trực tiếp

| Biến | Mô tả |
| --- | --- |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` | Pusher Channels cho chat thời gian thực. Trống → `POST /api/v1/chat/auth` trả 503. Giữ "Client events" tắt trong Pusher |
| `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | Khóa công khai của cùng app (không bao giờ là secret). Thiếu → phòng chat chạy bằng polling, hiện "Mất kết nối" |
| `COMMENT_MODERATION_PROVIDER` | `openai` (mặc định) hoặc `perspective` |
| `OPENAI_API_KEY`, `OPENAI_MODERATION_MODEL` | Kiểm duyệt độc hại cho bình luận (mặc định `omni-moderation-latest`). Không có khóa → mọi bình luận qua luật cục bộ đều chờ admin |
| `PERSPECTIVE_API_KEY` | Nếu chọn `perspective` |
| `COMMENT_LINK_ALLOWLIST`, `COMMENT_BLOCKLIST` | Danh sách host được phép link / từ bị chặn bổ sung (phân tách bằng dấu phẩy) |
| `LIVE_JITSI_HOSTS`, `LIVE_EMBED_ALLOWED_HOSTS` | Host Jitsi tự dựng / host nhúng tùy chọn (https). Đặt **cùng giá trị** với `NEXT_PUBLIC_LIVE_JITSI_HOSTS`, `NEXT_PUBLIC_LIVE_EMBED_ALLOWED_HOSTS` của web |

Chi tiết: [chat](chat.md), [blog](blog.md), [live-classes](live-classes.md).

## Vận hành

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `LOG_LEVEL` | `info` (`silent` khi `NODE_ENV=test`) | `fatal`…`trace`, `silent`. Log là JSON một dòng trên stdout |
| `REDIS_URL` | trống | Trống = cache trong tiến trình. Compose: `COMPOSE_PROFILES=cache`, `redis://redis:6379` |
| `CACHE_PUBLIC_CATALOG_SECONDS` | 60 (0–3600; 0 tắt) | Thời gian tối đa catalog công khai được phục vụ từ cache |
| `LEGACY_ROUTES_DEPRECATED_SINCE` | trống | Thời điểm bắt đầu gắn header `Deprecation` cho route cũ |
| `LEGACY_ROUTES_SUNSET` | trống | Từ thời điểm này route cũ trả `410 Gone`. Phải sau ngày deprecation; sai định dạng thì API không khởi động |
| `SEED_DEMO_PASSWORD` | `Shanity-Demo-2026!` | Mật khẩu tài khoản demo (12–128 ký tự) |

Xem [architecture](architecture.md#bề-mặt-api) về route cũ và `/api/v1`.

## Footer và pháp lý (web, đều tùy chọn)

`NEXT_PUBLIC_SOCIAL_FACEBOOK`, `_YOUTUBE`, `_TIKTOK`, `_LINKEDIN`, `_GITHUB` (chỉ URL `https`, để trống thì ẩn mục), `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_ADDRESS` (tên và địa chỉ đơn vị vận hành hiển thị ở dòng bản quyền; mặc định là tên thương hiệu).

> Hai trang `/legal/terms` và `/legal/privacy` hiện là khung nội dung, **chưa phải văn bản pháp lý**. Cần được rà soát và điền thông tin đơn vị vận hành trước khi phát hành.

## Bí mật

Không commit `.env` hoặc secret. `JWT_SECRET`, `MEDIA_SIGNING_SECRET`, `BANK_WEBHOOK_*`, `STRIPE_*`, `PUSHER_SECRET`, `CLOUDINARY_API_SECRET`, `OPENAI_API_KEY` chỉ thuộc về API; không được xuất hiện trong biến `NEXT_PUBLIC_*`.

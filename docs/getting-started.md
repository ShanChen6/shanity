# Bắt đầu và chạy dự án

Hướng dẫn cài đặt môi trường phát triển. Mọi lệnh chạy từ thư mục gốc của repository.

## Yêu cầu

- Node.js 24 (Dockerfile dùng `node:24-alpine`) và Corepack để dùng pnpm 11.24.0.
- Docker Engine/Desktop có Compose plugin (cho PostgreSQL, hoặc để chạy toàn bộ stack).

```bash
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
```

## Cách 1 — Chạy trực tiếp trên máy (khuyến nghị khi phát triển)

PostgreSQL chạy trong Docker, web và API chạy bằng pnpm để có hot reload.

```bash
cp .env.example .env
```

Trong `.env`, tối thiểu cần đặt:

| Biến | Giá trị |
| --- | --- |
| `PGPASSWORD` | Mật khẩu PostgreSQL cục bộ (mẫu chỉ là placeholder) |
| `JWT_SECRET` | Chuỗi ngẫu nhiên ≥ 32 byte: `openssl rand -hex 32` |
| `WEB_ORIGIN` | `http://localhost:3000` (đã có sẵn trong mẫu) |

Sau đó:

```bash
docker compose up -d --wait postgres      # PostgreSQL 17, chỉ bind 127.0.0.1
pnpm --filter api db:migrate              # tạo schema
pnpm --filter api seed:demo               # tùy chọn: dữ liệu demo
pnpm dev:api                              # http://localhost:4000
pnpm dev:web                              # http://localhost:3000   (terminal khác)
```

Kiểm tra: `curl http://localhost:4000/health/db` trả `200` khi API kết nối được database (và `503` với thông báo chung khi không).

Ghi chú:

- API và CLI database đọc `.env` ở thư mục gốc. Biến môi trường đã export trong shell được ưu tiên hơn file.
- `PORT` là cổng API khi chạy trực tiếp (mặc định 4000). `API_PORT` và `WEB_PORT` chỉ ánh xạ cổng của Docker Compose.
- PostgreSQL session dùng UTC; mọi cột thời gian là `timestamptz`.
- Các lệnh `db:*` biên dịch API trước (`nest build`) rồi chạy CLI đã biên dịch trong `apps/api/database`.
- Next.js chỉ đọc `NEXT_PUBLIC_API_URL` từ `.env` gốc; không đưa biến bí mật của backend vào bundle web.

### Tài khoản để đăng nhập

- **Super admin** (dùng cho mọi môi trường): đặt `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (12–128 ký tự) trong `.env`, rồi chạy `pnpm --filter api build && node apps/api/database/cli.mjs seed-admin` (chỉ tạo tài khoản này; đây là lệnh Compose dùng). `pnpm --filter api db:seed` cũng tạo super admin nhưng kèm khóa mẫu và tài khoản demo, nên chỉ dùng khi phát triển. Lệnh không ghi đè mật khẩu của quản trị viên đã tồn tại.
- **Tài khoản demo** (chỉ phát triển): `pnpm --filter api seed:demo` tạo `admin@`, `instructor@`, `student@` và `finance@shanity.local`, cùng khóa học đã xuất bản, khóa nháp, ghi danh, một bài đã hoàn thành và một bài tự luận đang chờ chấm. Mật khẩu là `SEED_DEMO_PASSWORD` hoặc giá trị mặc định trong `.env.example`. Lệnh từ chối chạy khi `NODE_ENV=production` và chạy lại an toàn.
- **Tự đăng ký** tại `/register` luôn tạo tài khoản `student`; vai trò khác chỉ cấp qua quản trị (xem [permissions](permissions.md) và [admin](admin.md)).

## Cách 2 — Chạy toàn bộ bằng Docker Compose

```bash
cp .env.example .env
# Bắt buộc: PGPASSWORD, JWT_SECRET, WEB_ORIGIN, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
docker compose up --build -d
docker compose ps
docker compose logs -f migrate api
```

Compose khởi động theo thứ tự: `postgres` (healthcheck) → `migrate` (`migrate` rồi `seed-admin`, chạy một lần) → `api` → `web`. Web ở cổng 3000 và API ở cổng 4000 trên máy host; cổng trong container không đổi.

Đổi cổng host:

```bash
WEB_PORT=3001 API_PORT=4001 docker compose up --build -d
```

hoặc đặt `WEB_PORT`, `API_PORT`, `PGPORT` trong `.env`. Nếu đổi cổng/địa chỉ API công khai, đặt `NEXT_PUBLIC_API_URL` **trước khi build** (biến này và các `NEXT_PUBLIC_*` khác được nhúng vào bundle lúc build).

Dừng: `docker compose down` (giữ volume `postgres_data` và `avatar_data`). Không dùng `down -v` nếu cần giữ dữ liệu.

Redis là tùy chọn: `COMPOSE_PROFILES=cache` và `REDIS_URL=redis://redis:6379`. Chi tiết vận hành và triển khai production: [deployment](deployment.md).

## Các lệnh thường dùng

| Lệnh | Công dụng |
| --- | --- |
| `pnpm dev:api` / `pnpm dev:web` | Chạy ở chế độ phát triển |
| `pnpm build` | Build API và web |
| `pnpm --filter api db:migrate` | Áp dụng migration chưa chạy (chạy lại an toàn) |
| `pnpm --filter api db:revert` | Lùi migration gần nhất — xem [database](database.md#lùi-migration) |
| `pnpm --filter api db:adopt-legacy` | Chuyển lịch sử migration Knex cũ sang TypeORM |
| `pnpm --filter api db:seed` | Seed phát triển (khóa mẫu, tài khoản demo, super admin) |
| `pnpm --filter api seed:course` | Khóa học JavaScript mẫu |
| `pnpm --filter api seed:demo` | Bốn tài khoản demo và nội dung demo |

Kiểm thử và kiểm tra chất lượng: [testing](testing.md).

## Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
| --- | --- |
| API dừng ngay khi khởi động | Thiếu/ sai `JWT_SECRET` (< 32 byte), `WEB_ORIGIN` có path, cấu hình Google thiếu một phần, hoặc không kết nối được PostgreSQL |
| `password authentication failed` | Volume PostgreSQL cũ đã khởi tạo với mật khẩu/người dùng khác; đổi biến môi trường không sửa database có sẵn trong volume |
| Đăng nhập xong nhưng bị đưa về `/login` | Web và API không cùng hostname (cookie host-only), hoặc `WEB_ORIGIN` không khớp origin trình duyệt |
| `403` khi gọi POST/PATCH bằng curl | Thiếu header `Origin` khớp `WEB_ORIGIN` |
| `next build` lỗi lạ | Build web phải chạy với `NODE_ENV=production` |
| Web gọi sai API sau khi đổi URL | `NEXT_PUBLIC_API_URL` được nhúng lúc build; build lại |

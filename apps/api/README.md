# Shanity API

NestJS 12 (TypeScript, ESM) với TypeORM 1.1 + PostgreSQL. Là ranh giới bảo mật duy nhất của nền tảng: xác thực phiên bằng cookie HttpOnly, kiểm tra vai trò từ database ở mọi request và kiểm tra quyền trên từng tài nguyên.

Tài liệu tổng quan ở [README gốc](../../README.md) và [docs/](../../docs/README.md). Tài liệu liên quan nhất tới API: [architecture](../../docs/architecture.md), [database](../../docs/database.md), [authentication](../../docs/authentication.md), [testing](../../docs/testing.md).

## Chạy

Từ thư mục gốc repository (cần `.env`, xem [getting-started](../../docs/getting-started.md)):

```bash
docker compose up -d --wait postgres
pnpm --filter api db:migrate
pnpm dev:api            # nest start --watch, http://localhost:4000
```

`pnpm --filter api start:prod` chạy `node dist/main.js` (cần build trước). `GET /health/db` kiểm tra kết nối database.

## Cấu trúc `src/`

| Thư mục | Nội dung |
| --- | --- |
| `auth/`, `users/`, `avatar/` | Đăng ký/đăng nhập, phiên, Google OAuth, hồ sơ, quản lý người dùng, avatar |
| `courses/` | Khóa học, chương, ghi danh, giá (`pricing/`), thumbnail, quyền sở hữu |
| `modules/lessons` | Bài học, quyền truy cập, phát video/tài liệu |
| `modules/progress`, `modules/instructor` | Tiến độ học viên; báo cáo cho giảng viên |
| `modules/quiz` | Soạn quiz, làm bài, chấm, hàng chờ chấm, công bố |
| `modules/payment` | Đơn hàng, checkout, provider (VietQR, Stripe), webhook, đối soát, quản trị đơn |
| `modules/chat`, `modules/blog`, `modules/live` | Chat theo khóa, blog + bình luận, lớp trực tiếp |
| `modules/import`, `modules/curriculum` | Nhập bài học/quiz từ tệp; sự kiện thay đổi giáo trình |
| `common/` | Middleware, guard miền, envelope, filter, logger, bí danh `/api/v1` |
| `cache/`, `storage/`, `security/` | Cache (bộ nhớ/Redis) và rate limiter, lưu trữ media, làm sạch HTML |
| `database/` | `data-source`, `migrate`, `migrations/`, `seeds/` |

Các thư mục ngoài `src/`: `database/` (CLI `cli.mjs`, `seeds/`, test migration `typeorm.test.mjs`, fixture schema cũ) và `test/` (e2e, helper, `browser-server.mjs` cho Playwright).

## Lệnh

| Lệnh | Công dụng |
| --- | --- |
| `build` / `start` / `start:dev` / `start:debug` / `start:prod` | Biên dịch và chạy |
| `typecheck` / `lint` / `format` | `tsc --noEmit` (gồm cả e2e) / oxlint type-aware / Prettier |
| `test` / `test:watch` / `test:cov` | Unit test (Vitest) |
| `test:e2e` | E2E với PostgreSQL thật, chạy tuần tự |
| `test:database` (`test:course-schema`) | Test migration, cần DB tên kết thúc `_test` |
| `db:migrate` / `db:revert` / `db:adopt-legacy` | Migration, lùi migration gần nhất, nhận lịch sử Knex |
| `db:seed` / `seed:course` / `seed:demo` | Seed phát triển |

Các lệnh `db:*` và `seed:*` biên dịch trước rồi chạy `database/cli.mjs`; chi tiết ở [database](../../docs/database.md). Quy ước viết mã: dùng đuôi `.js` khi import nội bộ (ESM), mọi thay đổi schema đi kèm migration mới đăng ký trong `src/database/migrations/index.ts`, và thêm route mới vào `src/common/api-v1-routes.ts` hoặc ghi rõ lý do không có alias (test sẽ báo nếu quên).

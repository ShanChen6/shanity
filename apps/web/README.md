# Shanity Web

Next.js 16, React 19, TypeScript, Tailwind CSS v4.

Từ root: `pnpm dev:web`; backend: `pnpm dev:api` sau khi migrate PostgreSQL. Cấu hình `NEXT_PUBLIC_API_URL=http://localhost:4000` và `WEB_ORIGIN=http://localhost:3000` trong `.env` gốc.

Trang: `/login`, `/register`, `/profile`, `/auth/callback`.

- [Tích hợp Auth, cấu hình cookie/Google và chạy test](../../docs/auth-frontend.md)
- [Theme và component dùng chung](../../docs/frontend.md)

Kiểm tra: `pnpm --filter web lint`, `pnpm --filter web build`, `pnpm --filter web test:e2e` (cần backend/database test theo tài liệu).

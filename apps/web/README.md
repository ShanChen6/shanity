# Shanity Web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query. Giao diện cho học viên, giảng viên, quản trị viên và nhân viên tài chính; mọi dữ liệu nghiệp vụ lấy từ [API](../api/README.md) qua `/api/v1/<miền>/*`.

> Next.js 16 có thay đổi so với phiên bản bạn có thể quen. Đọc hướng dẫn trong `node_modules/next/dist/docs/` trước khi viết mã (xem [AGENTS.md](AGENTS.md)).

## Chạy

Từ thư mục gốc repository (cần API chạy, xem [getting-started](../../docs/getting-started.md)):

```bash
pnpm dev:web                      # http://localhost:3000
pnpm --filter web typecheck       # next typegen && tsc --noEmit
pnpm --filter web lint
pnpm --filter web test            # Vitest + jsdom
NODE_ENV=production pnpm --filter web build
pnpm --filter web test:e2e        # Playwright, cần stack thật (docs/testing.md)
```

Cấu hình trong `.env` gốc: `NEXT_PUBLIC_API_URL` (origin công khai của API, nhúng lúc build), `NEXT_PUBLIC_SITE_URL`, `API_INTERNAL_URL` (cho server Next gọi API) và các `NEXT_PUBLIC_*` tùy chọn — xem [configuration](../../docs/configuration.md). Web và API công khai phải cùng hostname vì cookie phiên là host-only.

## Cấu trúc

```text
src/app/          route (nhóm: (admin-auth) (dashboard) (instructor) (learning) (protected))
src/features/     logic + UI theo tính năng: api.ts, hook, component, test
src/components/   ui (primitive), layout, shared, learning, brand
src/config/       navigation.config.ts, breadcrumbs.ts, site.config.ts, brand.config.ts
src/lib/          api client, server-session, admin-access, auth-redirect
src/proxy.ts      chặn khách ở route bảo vệ
e2e/ tests/       Playwright
public/templates/ tệp mẫu nhập bài học và quiz
```

## Tài liệu

- [Giao diện web: route, design system, component](../../docs/frontend.md)
- [Phiên, route bảo vệ, Google](../../docs/authentication.md)
- [Khu vực quản trị và giảng viên](../../docs/admin.md)
- [Kiến trúc](../../docs/architecture.md) · [Kiểm thử](../../docs/testing.md)

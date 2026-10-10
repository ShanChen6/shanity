# Giao diện web (`apps/web`)

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, TanStack Query, `react-hook-form` + `zod`/`validator`, `@dnd-kit` (kéo-thả sắp xếp), FullCalendar (lịch), KaTeX, DOMPurify, `pusher-js`, `lucide-react`. Tên file kebab-case (component PascalCase cũng gặp ở `features/chat`, `features/quiz-*`); named export.

> Next.js 16 có thay đổi so với phiên bản bạn có thể đã quen. Đọc hướng dẫn trong `node_modules/next/dist/docs/` trước khi viết mã và chú ý thông báo deprecation (`apps/web/AGENTS.md`). Ví dụ: `src/proxy.ts` đóng vai trò middleware.

## Chạy

```bash
pnpm dev:web                  # http://localhost:3000, cần API đang chạy
pnpm --filter web typecheck   # next typegen && tsc --noEmit
pnpm --filter web lint
pnpm --filter web test        # Vitest
NODE_ENV=production pnpm --filter web build
```

`NEXT_PUBLIC_API_URL` (origin HTTP(S), không path/query) được kiểm tra và đóng vào bundle lúc build trong `next.config.ts`; chỉ biến công khai này được đọc từ `.env` gốc. Trình duyệt luôn dùng URL công khai, không dùng hostname nội bộ `api`. Server Next gọi API bằng `API_INTERNAL_URL`.

## Cấu trúc

```text
src/
├── app/            # route; nhóm: (admin-auth) (dashboard) (instructor) (learning) (protected)
│   ├── blog/ courses/ legal/ login/ register/ auth/callback/ forbidden/ student/
│   ├── api/og/     # ảnh Open Graph
│   ├── dev/theme/  # showcase theme — chỉ development
│   └── sitemap.ts robots.ts manifest.ts error.tsx
├── features/       # admin, admin-orders, auth, blog, chat, command-menu, content-import, courses,
│                   # grading-queue, home, instructor, legal, lessons, live, notifications, payments,
│                   # progress, quiz-builder, quiz-player, schedule, standalone-quiz, system-status, theme
├── components/     # ui, layout, shared, learning, brand
├── config/         # navigation.config, breadcrumbs, site.config, brand.config
├── hooks/          # useOptimisticMutation, useCurriculumNavigation, useKeyboardNavigation, useDebounce, useOnlineStatus
├── lib/            # api (client + adapters), server-session, admin-access, auth-redirect, utils
├── providers/      # query-provider, theme-provider, toast-provider
├── styles/         # color, theme, typography, responsive, base
└── proxy.ts        # chặn guest ở route bảo vệ
```

Mỗi feature chứa `api.ts` (gọi API qua `lib/api`), hook, component và test cạnh nhau. Route chỉ ráp các feature lại.

## Các nhóm route

| Nhóm | Ví dụ | Ai |
| --- | --- | --- |
| Công khai | `/`, `/courses`, `/courses/[slug]`, `/blog`, `/blog/[slug]`, `/legal/terms|privacy` | Mọi người (server-render, có SEO) |
| Xác thực | `/login`, `/register`, `/auth/callback`, `/admin/login` | Khách |
| `(dashboard)` | `/dashboard`, `/my-courses`, `/my-learning`, `/profile`, `/quizzes`, `/quiz-attempts`, `/orders`, `/account/orders`, `/checkout/[orderCode]` | Người đã đăng nhập |
| `(learning)` | `/learn/[courseSlug]`, `/[lessonSlug]`, `/chat`, `/quiz/[quizId]` | Học viên đã ghi danh |
| `student` | `/student/dashboard/schedule`, `/student/courses/[slug]/live/[sessionId]` | Học viên |
| `(instructor)` | `/instructor/*` | Giảng viên ([admin](admin.md)) |
| `(protected)` | `/admin/*` | Admin (và nhân viên tài chính ở `/admin/orders`) |

Điều hướng của mọi vai trò nằm ở **một nơi**, `config/navigation.config.ts` (`studentNav`, `instructorNav`, `adminNav`, `accountNav`, `quickActions`, `portals`, `footerNav` và các hàm `navigationFor`, `isNavActive`, `activeNavItem`, `searchableNavigation`). Breadcrumb ở `config/breadcrumbs.ts`. Test đối chiếu cả hai với cây `src/app`.

**Header thông minh**: breadcrumb động; **Cmd/Ctrl+K** mở menu lệnh (ARIA combobox/listbox trên `<dialog>` gốc, tìm không dấu, tìm cả khóa học công khai); menu người dùng; chuông thông báo; đổi theme; thu gọn đúng ở 320 px. **Chuông chỉ hiện dữ liệu có thật**: bài cần chấm (giảng viên), đơn chờ thanh toán và quiz đang làm dở (học viên) — không có dịch vụ thông báo nên không bịa. **Footer**: pháp lý, mạng xã hội (chỉ URL `https` qua `safeExternalUrl`, ẩn khi chưa cấu hình), sơ đồ trang và **trạng thái hệ thống** thật (poll `/health/db` mỗi 60 giây).

## Gọi API

`lib/api.ts`: `fetch` với `credentials: 'include'`, `no-store`, timeout 15 giây, `ApiError` (có `correlationId` lấy từ `X-Correlation-Id`), tự refresh phiên khi 401 và thử lại một lần. Web gọi `/api/v1/<miền>/*` cho mọi lời gọi nghiệp vụ; hai adapter `apiNestedPage` và `apiFlatPage` chuẩn hóa hai hình dạng phân trang để màn hình giữ nguyên kiểu dữ liệu; upload bài giảng dùng XHR để có tiến trình; các `fetch` phía server (catalog, chi tiết khóa, phiên đăng nhập) dùng chung `unwrapBody`/`toApiError`. Cố ý vẫn dùng đường dẫn gốc: `/auth/*`, `/health/*`, luồng stream media/avatar có chữ ký và các route thanh toán vốn đã ở `/api/v1/*`.

`QueryProvider` tạo một `QueryClient` mỗi tab, bật `refetchOnWindowFocus`/`refetchOnReconnect` (tiến độ đúng khi đổi thiết bị) và gắn `ProgressSync` để một mutation ở trang này (hoàn thành bài) làm mới tóm tắt ở trang khác (`/my-learning`). Chi tiết phiên và route bảo vệ: [authentication](authentication.md).

## Trạng thái UI

- **`QueryBoundary`**: một máy trạng thái cho màn hình dữ liệu — tải (skeleton/spinner có nhãn) → lỗi (thông điệp API + thử lại; lỗi 5xx kèm **mã tham chiếu** = correlation id) → rỗng → thành công.
- **`ToastProvider`/`useToast`**: một ngăn xếp toast toàn app; tự đóng nhưng tạm dừng khi rê chuột/focus (WCAG 2.2.1), gộp thông báo trùng, tối đa 4 cái hiển thị, lỗi tồn tại lâu hơn thành công. (Khu admin còn dùng toast riêng không tự đóng.)
- **`useOptimisticMutation`**: cập nhật lạc quan → rollback khi lỗi → invalidate khi xong, kèm toast; dùng cho sắp xếp bài giảng.
- Còn một vài nơi dùng `<Toast>` hoặc màu cứng riêng của cổng admin/giảng viên chưa gom về hạ tầng chung; việc còn lại là thay từng chỗ.

## Design system

- `app/globals.css` là entry point. Palette nguyên thủy ở `styles/color.css` (13 họ màu, thang 50–950; chỉ dùng trực tiếp trong trang showcase), token ngữ nghĩa light/dark ở `theme.css`, chuẩn hóa/trợ năng ở `base.css`, thang chữ ở `typography.css`, tiện ích bố cục ở `responsive.css`.
- **Màu thương hiệu** lấy từ logo (`public/assets/branding/`): `--brand-ink`, `--brand-teal` (mũ tốt nghiệp), `--brand-mint` (nét sáng chữ S), dùng qua `bg-brand-ink|teal|mint`. Mọi token ngữ nghĩa dựng trên hue teal này: giao diện sáng dùng teal đậm làm `--primary` (≥ 4,5:1 với chữ trắng), giao diện tối dùng mint làm `--primary` với chữ ink. **Không viết cứng mã hex hay màu Tailwind (`emerald-*`, `blue-*`…) trong component**; dùng token (`bg-primary`, `text-foreground`, `bg-surface`, `border-border`, `text-muted`, các token trạng thái success/warning/danger/info và trạng thái miền: khóa học, bài, quiz, online/offline). Đổi logo thì cập nhật ba biến brand, `BRAND.themeColor` và chạy `styles/contrast.test.ts`.
- **Theme** sáng/tối/hệ thống: `.dark` trên `<html>`; `ThemeProvider` lưu lựa chọn trong `localStorage` (`shanity-theme`); script đồng bộ trước paint tránh nhấp nháy; `viewport.themeColor` khớp token. Tương phản chữ/nền ≥ 4,5:1 và viền ô nhập/nhấn ≥ 3:1 ở cả hai theme, được test.
- **Typography**: `text-display`, `text-h1…h4`, `text-body-lg|body|body-sm`, `text-caption`, `text-code`, `text-link`; `font-sans|heading|mono` (Geist qua `next/font`); tiêu đề responsive bằng `clamp()`. Radius `rounded-sm…xl|full`, shadow `shadow-sm|md|lg`, motion `duration-fast|normal|slow`; layout `container` (tối đa 1280 px), `content`, `content-wide`, `content-sm`, `section`, `page`.
- **Trợ năng**: focus-visible vòng 3 px; tôn trọng reduced motion; không dùng riêng màu để biểu thị kết quả form (có `aria-invalid`, role alert, progress có tên/giá trị); skip link và một `main` landmark.
- **Logo**: `<BrandLogo variant="full|icon|monochrome" surface="auto|light|dark">` (`components/brand`) chuyển sáng/tối **chỉ bằng CSS** nên không nhấp nháy sai màu khi SSR; `monochrome` dùng CSS mask theo `currentColor`. Ảnh dùng `next/image` (AVIF → WebP): logo header 428 KB (PNG) còn ~3,5 KB (AVIF).
- **Showcase** `/dev/theme`: chỉ ở development; có palette, token, typography, form control, nút, trạng thái, card, avatar và các trạng thái chung.

### Component trong `components/ui`

`Button` (`primary|secondary|outline|ghost|danger|link`; cỡ `sm|md|lg|icon`; `loading`), `Input`/`Textarea`/`Select`, `Checkbox`/`Radio`/`Switch`, `Label`, `FormField` (tạo id và liên kết nhãn/mô tả/lỗi với control; render prop nên đặt trong Client Component), `Badge`, `Alert` (`info|success|warning|error` + `AlertTitle|AlertDescription`; error có `role=alert`), `Card` (+ `Header|Title|Description|Content|Footer`), `Progress`, `Skeleton`, `Separator`, `Avatar` (`AvatarImage|AvatarFallback`, ẩn ảnh lỗi để còn chữ cái), `Spinner`, `Icon`, `Table*`, `Dialog` và `Sheet` (trên `<dialog>` gốc, giữ/trả focus), `DropdownMenu`, `Toast`. Props native và `ref` được chuyển xuống phần tử tương ứng (React 19). Cần biến thể mới thì thêm vào component thay vì chồng utility mâu thuẫn.

`components/layout`: `AppShell`, `PageContainer`, `PageHeader`, `Section`, `AuthLayout`, `AdminLayout`, `SiteHeader`, `SiteFooter`, `Breadcrumbs`. `components/shared`: `QueryBoundary`, `EmptyState`, `ErrorState`, `LoadingState`, `ThemeToggle`.

```tsx
"use client";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function EmailExample() {
  return (
    <div className="space-y-4">
      <FormField label="Email" description="Dùng địa chỉ email của bạn.">
        {(props) => <Input {...props} type="email" autoComplete="email" required />}
      </FormField>
      <Button variant="primary">Tiếp tục</Button>
    </div>
  );
}
```

## SEO

Catalog và blog được render ở server. `sitemap.ts` (dựng theo từng request) liệt kê các trang tĩnh (`/`, `/courses`, `/blog`, trang pháp lý) và các bài blog đã xuất bản — **chưa** liệt kê từng khóa học; `robots.ts`; `manifest.ts` (PWA) thay manifest tĩnh. Canonical và Open Graph cho blog ở `features/blog/seo.ts` và `features/blog/og.ts` (ảnh OG tại `app/api/og`), kèm JSON-LD cho bài viết. Đặt `NEXT_PUBLIC_SITE_URL` ở production, nếu không URL tuyệt đối sẽ trỏ về localhost (`config/site.config.ts`).

## Checklist rà giao diện

- Không tràn ngang ở 1440, 768, 390 và 320 px; kiểm tra sáng/tối.
- Tab qua mọi control, skip link bằng Enter, nhãn và liên kết lỗi của input; submit rỗng focus ô đầu tiên lỗi.
- Reduced motion, trạng thái disabled/loading/lỗi/thành công, hộp thoại giữ và trả focus.
- Mạng: không có request thừa, không lỗi JavaScript trong console.
- Quét axe WCAG 2 A/AA và 2.1 AA (hỗ trợ, không thay thế rà bằng screen reader).

# Nền tảng giao diện Shanity

## Chạy và phạm vi

```bash
pnpm install --frozen-lockfile
pnpm dev:web
# Mở http://localhost:3000/login
```

`/login`, `/register` và `/profile` đã nối backend Auth + User; xem [hướng dẫn tích hợp](auth-frontend.md) để cấu hình API URL/cookie và chạy e2e. Bộ component/layout dưới đây tiếp tục được tái sử dụng. Trang `/` hiện hữu vẫn có liên kết đăng nhập.

## Theme và layout

- `apps/web/src/app/globals.css` là entry point. Palette primitive ở `src/styles/color.css`; semantic light/dark token ở `theme.css`; normalization/accessibility ở `base.css`; type scale ở `typography.css`; layout utilities ở `responsive.css`.
- Palette primitive cung cấp 13 họ màu với scale 50-950. Chỉ dùng trực tiếp trong phần trình bày palette; UI ứng dụng dùng token như `bg-primary`, `text-foreground`, `bg-surface`, `border-border`, `text-muted` và các token status.
- Semantic API gồm primary/secondary/accent, hierarchy surface, text, border/input/focus, success/warning/danger/info và domain state cho course, lesson, quiz, online/offline. Một số tên cũ (`on-primary`, `surface-muted`, `focus`, `*-bg`) được giữ dưới dạng alias tương thích.
- Light/dark dùng chung semantic API; `.dark` trên `<html>` thay đổi token. Provider lưu lựa chọn `light`, `dark` hoặc `system` vào `localStorage` (`shanity-theme`). Script đồng bộ trước paint tránh flash; system theme theo dõi thay đổi OS. Font Geist/Geist Mono vẫn được tải bằng `next/font`.
- Typography utilities: `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body-lg`, `text-body`, `text-body-sm`, `text-caption`, `text-code`, `text-link`; `font-sans`, `font-heading`, `font-mono`. Display/headings responsive bằng `clamp()`.
- Radius semantic: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`; shadow: `shadow-sm`, `shadow-md`, `shadow-lg`. Utility layout: `container`, `content`, `content-wide`, `content-sm`, `section`, `page`; `PageContainer` dùng `container` (tối đa 1280px).
- Focus-visible có ring 3px; input hỗ trợ hover/focus/disabled/error; reduced motion được tôn trọng. Không dùng màu đơn lẻ để thể hiện form result: validation có `aria-invalid`/text, alert có role tương ứng, progress có accessible name/value.
- `/dev/theme` là showcase chỉ hoạt động trong môi trường development; có palette, token/surface, typography, form controls, button variants, status, cards, progress và loading states.
- `AuthLayout` tiếp tục giữ header/footer, skip link và một main landmark. Hai cột từ 1024px; layout không chứa logic xác thực.

## Component dùng ngay

Tất cả component trong `apps/web/src/components/ui/`, tên file kebab-case và named export PascalCase. `className` bổ sung layout; nếu cần variant mới, thêm vào component thay vì chồng utility trái ngược. Props native và ref được chuyển xuống phần tử tương ứng (React 19).

| Component                             | Props / hành vi                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------ | ---------------------------------------------------- | --------------------- | ---- | ---- | ----------------------------------------------------------------------------- |
| Button                                | `variant="primary"                                                                                                       | "secondary"   | "outline"                                  | "ghost"                                              | "danger"`, `size="sm" | "md" | "lg" | "icon"`, `loading`, `loadingLabel`; mặc định type=button; loading tự disabled |
| Input, Textarea, Select               | Props native, hỗ trợ ref, semantic states; không tự tạo label                                                            |
| Checkbox, Radio, Switch               | Native input, semantic accent/focus/disabled styles                                                                      |
| Label                                 | Props label native; dùng htmlFor liên kết input                                                                          |
| FormField                             | `id?`, `label`, `description?`, `error?`, children render prop; tạo ID ổn định và liên kết aria-describedby/aria-invalid |
| Badge, Alert                          | Badge tones semantic; Alert `tone="info"                                                                                 | "success"     | "warning"                                  | "error"`, error dùng role=alert, còn lại role=status |
| Card                                  | `variant="default"                                                                                                       | "interactive" | "elevated"`; không áp đặt heading/landmark |
| Progress, Skeleton, Separator, Avatar | Domain progress bar có accessible name/value; primitives loading/layout/avatar tối giản                                  |
| Spinner                               | `label?`, `decorative?`; spinner độc lập có tên đọc cho screen reader, dùng decorative khi nút đã có nhãn loading        |
| Icon                                  | SVG nội bộ nhỏ, luôn decorative; control chứa icon phải có tên accessible                                                |

FormField dùng `useId`, nên phần form với render prop nằm trong Client Component. Ví dụ:

```tsx
"use client";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function EmailExample() {
  return (
    <div className="space-y-4">
      <FormField label="Email" description="Dùng địa chỉ email của bạn.">
        {(props) => (
          <Input {...props} type="email" autoComplete="email" required />
        )}
      </FormField>
      <Button variant="primary">Tiếp tục</Button>
    </div>
  );
}
```

`features/auth/credentials-form.tsx` là form thực tế; `login-preview.tsx` giữ làm ví dụ UI cũ, không được mount vào route. Chưa tạo EmptyState vì chưa có danh sách/rỗng nào cần dùng; chưa tạo bảng, biểu đồ hay player.

## Kiểm tra

```bash
pnpm --filter web lint
pnpm --filter web build
```

Frontend hiện có `pnpm --filter web test:e2e` cho Auth tích hợp; xem auth-frontend.md. Theme showcase được mở tại `/dev/theme` khi chạy development để rà trực quan light/dark và các component; không thêm dependency vào repo.

Checklist browser:

- Desktop 1440px, tablet 768px, mobile 390px và 320px không tràn ngang.
- Kiểm tra light/dark, focus bằng Tab, skip link bằng Enter, nhãn và liên kết lỗi của input.
- Submit rỗng focus email; điền dữ liệu mẫu chạy loading rồi thông báo hoàn tất, không đăng nhập.
- Toggle mật khẩu, native disabled, reduced motion, trạng thái thông báo lỗi/thành công/cảnh báo.
- Theo dõi network: không có POST hoặc request Auth; không có lỗi runtime JavaScript.
- Quét axe theo WCAG 2 A/AA và 2.1 AA. Kết quả tự động hỗ trợ kiểm tra, không thay thế nghiệm thu đầy đủ bằng screen reader.

Kết quả bản bàn giao: lint/build thành công; route `/login` được prerender. Playwright xác nhận toàn bộ checklist trên; axe không phát hiện vi phạm trong các viewport light/dark và trạng thái lỗi đã kiểm tra. Ảnh mobile được rà soát trực quan và điều chỉnh để form xuất hiện ngay dưới header; ảnh desktop cũng đã được kiểm tra. Không chạy test backend vì thay đổi chỉ thuộc nền tảng frontend/tài liệu.

# Nền tảng giao diện Shanity

## Chạy và phạm vi

```bash
pnpm install --frozen-lockfile
pnpm dev:web
# Mở http://localhost:3000/login
```

`/login`, `/register` và `/profile` đã nối backend Auth + User; xem [hướng dẫn tích hợp](auth-frontend.md) để cấu hình API URL/cookie và chạy e2e. Bộ component/layout dưới đây tiếp tục được tái sử dụng. Trang `/` hiện hữu vẫn có liên kết đăng nhập.

## Theme và layout

- `apps/web/src/app/globals.css`: biến CSS semantic, nối với utility Tailwind v4 qua `@theme inline`. Dùng `bg-background`, `bg-surface`, `text-foreground`, `text-muted`, `border-border`, `bg-primary`, `text-on-primary`, cùng các cặp màu success/warning/danger.
- Giữ Geist/Geist Mono từ `next/font` hiện có; body thực sự dùng font token thay vì Arial cố định. Root đặt `lang="vi"` và metadata Shanity.
- Typography: `text-caption`, `text-body`, `text-title`, `text-display`; weight theo utility Tailwind (`font-medium`, `font-semibold`, `font-bold`). Spacing theo thang 4px mặc định của Tailwind; ưu tiên 2/3/4/6/8/12/16.
- `rounded-control` (12px), `rounded-card` (24px), `shadow-card`, `shadow-float`; `.control` cao tối thiểu 44px. Input dùng chữ 16px để tránh iOS tự zoom.
- Focus outline 3px với offset 4px. Hover dùng token primary-hover/surface-muted; disabled dùng native `disabled`, loading có `aria-busy` và spinner. Tôn trọng `prefers-reduced-motion`.
- Giữ cơ chế dark mode tự động theo hệ điều hành từ starter, bổ sung đủ semantic token cho nền, chữ, viền và trạng thái. Không thêm toggle hoặc persistence theme.
- `PageContainer`: rộng tối đa 1280px, lề 16px trên mobile và 32px từ 768px.
- `AuthLayout`: header/footer, skip link và một main landmark. Hai cột từ 1024px; dưới ngưỡng này ẩn phần giới thiệu để ưu tiên form. Có thể bọc form đăng ký/khôi phục sau này, không chứa logic xác thực.

## Component dùng ngay

Tất cả component trong `apps/web/src/components/ui/`, tên file kebab-case và named export PascalCase. `className` bổ sung layout; nếu cần variant mới, thêm vào component thay vì chồng utility trái ngược. Props native và ref được chuyển xuống phần tử tương ứng (React 19).

| Component | Props / hành vi |
| --- | --- |
| Button | `variant="primary" | "secondary" | "ghost"`, `loading`, `loadingLabel`; mặc định type=button; loading tự disabled |
| Input | Props input native, hỗ trợ ref, disabled, aria-invalid; không tự tạo label |
| Label | Props label native; dùng htmlFor liên kết input |
| FormField | `id?`, `label`, `description?`, `error?`, children render prop; tạo ID ổn định và liên kết aria-describedby/aria-invalid |
| Card | Khung div nền surface, border, radius và shadow; không áp đặt heading/landmark |
| Alert | `tone="info" | "success" | "warning" | "error"`, `title?`; error dùng role=alert, còn lại role=status |
| Spinner | `label?`, `decorative?`; spinner độc lập có tên đọc cho screen reader, dùng decorative khi nút đã có nhãn loading |
| Icon | SVG nội bộ nhỏ, luôn decorative; control chứa icon phải có tên accessible |

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
        {(props) => <Input {...props} type="email" autoComplete="email" required />}
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

Frontend hiện có `pnpm --filter web test:e2e` cho Auth tích hợp; xem auth-frontend.md. Phần kiểm tra theme ban đầu bên dưới được thực hiện trước khi nối API. Lần triển khai này dùng Playwright + axe-core cài riêng trong `/tmp/shanity-ui-tools` và Chrome hệ thống, không thêm dependency vào repo.

Checklist browser:

- Desktop 1440px, tablet 768px, mobile 390px và 320px không tràn ngang.
- Kiểm tra light/dark, focus bằng Tab, skip link bằng Enter, nhãn và liên kết lỗi của input.
- Submit rỗng focus email; điền dữ liệu mẫu chạy loading rồi thông báo hoàn tất, không đăng nhập.
- Toggle mật khẩu, native disabled, reduced motion, trạng thái thông báo lỗi/thành công/cảnh báo.
- Theo dõi network: không có POST hoặc request Auth; không có lỗi runtime JavaScript.
- Quét axe theo WCAG 2 A/AA và 2.1 AA. Kết quả tự động hỗ trợ kiểm tra, không thay thế nghiệm thu đầy đủ bằng screen reader.

Kết quả bản bàn giao: lint/build thành công; route `/login` được prerender. Playwright xác nhận toàn bộ checklist trên; axe không phát hiện vi phạm trong các viewport light/dark và trạng thái lỗi đã kiểm tra. Ảnh mobile được rà soát trực quan và điều chỉnh để form xuất hiện ngay dưới header; ảnh desktop cũng đã được kiểm tra. Không chạy test backend vì thay đổi chỉ thuộc nền tảng frontend/tài liệu.

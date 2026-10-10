# Kiểm thử và chất lượng mã

## Tổng quan

| Lớp | Công cụ | Lệnh | Cần database |
| --- | --- | --- | --- |
| API — unit | Vitest (`**/*.spec.ts` trong `src/`, `globals`) | `pnpm --filter api test` | Không |
| API — e2e / tích hợp | Vitest + Supertest, **PostgreSQL thật** | `pnpm --filter api test:e2e` | Có |
| API — migration | `node --test` (`database/typeorm.test.mjs`) | `pnpm --filter api test:database` | Có, tên DB kết thúc `_test` |
| API — kiểm tra kiểu / lint | `tsc --noEmit`, oxlint (type-aware) | `pnpm --filter api typecheck` / `lint` | Không |
| Web — unit | Vitest + jsdom + Testing Library (`src/**/*.test.{ts,tsx}`) | `pnpm --filter web test` | Không |
| Web — trình duyệt | Playwright (Chromium; `desktop-chromium` 1440×900 và `mobile-chromium` 375×812) | `pnpm --filter web test:e2e` | Có, cần stack chạy |
| Web — kiểm tra kiểu / lint | `next typegen && tsc --noEmit`, ESLint | `pnpm --filter web typecheck` / `lint` | Không |
| Build | `nest build`, `next build` | `pnpm build` | Không |

Quy tắc trước khi merge: typecheck, lint, build và test liên quan phải xanh. Với Auth, Quiz và Payment kiểm tra thêm: truy cập sai quyền, yêu cầu lặp và lỗi mạng.

> `next build` phải chạy với `NODE_ENV=production` (`NODE_ENV=development` làm build hỏng).

## API

**Unit** (`pnpm --filter api test`): đặt cạnh mã nguồn (`*.spec.ts`). Timeout 30 giây (băm mật khẩu scrypt cố ý chậm ~0,3 giây và 128 MiB).

**E2E** (`vitest.config.e2e.ts`): chạy `**/*.e2e-spec.ts`, `test/database/migrations/**` và `test/modules/**/*.spec.ts`. Mọi suite dùng chung một PostgreSQL thật và một số assert trên số liệu toàn cục (thống kê người dùng) nên **các file chạy tuần tự** (`fileParallelism: false`). Chuẩn bị:

```bash
docker compose up -d --wait postgres
# trỏ PGDATABASE vào một database thử riêng (ví dụ shanity_test), cùng PGUSER/PGPASSWORD/PGPORT
export JWT_SECRET=$(openssl rand -hex 32) WEB_ORIGIN=http://localhost:3000
pnpm --filter api db:migrate
pnpm --filter api test:e2e
```

Các suite tạo email ngẫu nhiên và định danh rate-limit riêng, giữ dữ liệu thử và không reset database; vẫn nên dùng database dành riêng cho test. `Google` được mock ở ranh giới xác minh danh tính, test không bao giờ gọi Google thật. Test cache Redis cần `REDIS_TEST_URL=redis://localhost:6379`; không có thì các test đó được bỏ qua (có ghi rõ) và phần bộ nhớ vẫn chạy.

Phân bố test e2e theo miền:

| Thư mục | Nội dung |
| --- | --- |
| `test/*.e2e-spec.ts` | App, auth, Google, avatar, khóa học, chương, bài (văn bản/video/tài liệu/xem trước/tuần tự), quyền truy cập bài, đồng thời & idempotency, tiếp tục học chéo thiết bị, tiến độ cho giảng viên |
| `test/e2e/` | Vòng đời quiz, kiểm toán bảo mật quiz, kiểm toán cuối Sprint 9 (`quiz-e2e-support.ts` là helper) |
| `test/modules/payment/` | Snapshot đơn, checkout × webhook, webhook đồng thời, đơn của học viên, quản trị đơn |
| `test/modules/{chat,blog,live,learning,quiz,course,import}/` | Theo từng module |
| `test/database/`, `test/cache/`, `test/common/` | Migration, cache (kể cả Redis thật), `/api/v1`, envelope, correlation id |
| `test/support/` | Fixture dùng chung (`learning-fixture`, `migrations`, `zip`) |

**Kiểm tra kiến trúc bằng test** (thêm vi phạm thì test đỏ): mọi route gốc phải được phân loại "có alias `/api/v1`" hoặc "cố ý không alias"; mọi entity phải có khóa UUID và cột audit (trừ ngoại lệ có lý do); core thanh toán không được nhắc tới cổng cụ thể; không có route `PATCH/PUT/DELETE` đơn hàng; cấu hình điều hướng web phải trỏ tới trang có thật.

**Migration** (`pnpm --filter api test:database`): mỗi test tạo và xóa một schema ngẫu nhiên; bao phủ migration trên DB trống và chạy đồng thời, `adopt-legacy`, Up/Down/Up, ràng buộc của `Course`, seed idempotent. Bắt buộc DB tên kết thúc `_test`.

## Web

**Unit** (`pnpm --filter web test`): cấu hình điều hướng/breadcrumb/brand/site (đối chiếu với `src/app`), tương phản màu (`styles/contrast.test.ts` đọc trực tiếp `theme.css` và tính tỉ lệ WCAG — đổi token làm tụt tương phản sẽ đỏ), `QueryBoundary`, toast, `useOptimisticMutation`, `lib/api`, và test theo feature (thanh toán, quiz, chat, blog, lớp trực tiếp, nhập nội dung…). Không dùng mạng thật.

**Playwright** (`playwright.config.ts`: `testDir: ./e2e`, một worker, không song song, không trace, chụp ảnh khi lỗi). Cần stack thật đang chạy:

```bash
export WEB_TEST_URL=http://localhost:3000        # mặc định http://localhost:55461
export API_TEST_URL=http://localhost:4000
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome   # hoặc dùng Chromium của Playwright
pnpm --filter web test:e2e
```

Các spec trong `e2e/`: `student-happy-path`, `my-learning`, `payment-checkout` (cần khóa mẫu đã seed và chuyển sang PAID, `E2E_BANK_WEBHOOK_KEY`, API chạy với `BANK_WEBHOOK_API_KEY`, `VIETQR_*`, `WEB_ORIGIN` đúng; xem đầu file), `admin-orders`, `essay-assessment-ui`, `edge-cases-and-failure-ux`. Thư mục `tests/` (`auth.spec.ts`, `admin-redirect.spec.ts`, `instructor.spec.ts`) là các kịch bản trình duyệt cho auth, route admin và cổng giảng viên; chúng nằm ngoài `testDir` mặc định nên cần cấu hình Playwright trỏ tới chúng khi chạy.

**Fixture trình duyệt cho Auth** (`apps/api/test/browser-server.mjs`): NestJS thật + PostgreSQL thật, nhưng thay `GoogleProvider` bằng bản giả để test luồng Google. Nó **từ chối khởi động** nếu thiếu `NODE_ENV=test`, `AUTH_BROWSER_TEST=1` và `PGDATABASE` kết thúc `_test`; ứng dụng sản phẩm không có công tắc test nào. Rate limit vẫn bật, mỗi test dùng một định danh limiter riêng qua header `x-shanity-test-client`. Ví dụ chạy:

```bash
# build API trước (pnpm --filter api build); đặt PG* của DB *_test, JWT_SECRET, WEB_ORIGIN
NODE_ENV=test AUTH_BROWSER_TEST=1 PORT=55462 node apps/api/test/browser-server.mjs &
NEXT_PUBLIC_API_URL=http://localhost:55462 pnpm --filter web build
pnpm --filter web start --port 55461 &
AUTH_BROWSER_TEST=1 API_TEST_URL=http://localhost:55462 WEB_TEST_URL=http://localhost:55461 \
  pnpm --filter web test:e2e
```

Sau khi thử, dừng các tiến trình và container; không trỏ vào dữ liệu production.

Tích hợp giảng viên (không qua trình duyệt): `node --test --test-isolation=none apps/api/test/instructor.integration.mjs` trên database `_test` đã build/migrate — kiểm tra quyền sở hữu, học viên bị từ chối, payload sai, sắp xếp đủ bài, kiểm tra media, ràng buộc xuất bản, hiển thị công khai, hủy xuất bản, xóa và lưu trữ.

## Lưu ý và hạn chế đã biết

- **Google thật** chưa được kiểm thử tự động (xem [authentication](authentication.md#vận-hành-và-giới-hạn)).
- Một số spec Playwright cũ (Google qua provider test, quản trị người dùng, kích thước profile, avatar, `student-happy-path`) đã từng đỏ sẵn trước các đợt refactor gần đây; nếu gặp, so sánh với commit gốc trước khi quy cho thay đổi của bạn, và **không bỏ qua hay xóa test để "xanh"**.
- `pnpm --filter api db:verify` đã lỗi thời; dùng `test:database` ([database](database.md)).
- Cảnh báo `MaxListenersExceededWarning` trong log test API xuất phát từ việc nhiều spec tích hợp cùng mở server HTTP trong một tiến trình; không ảnh hưởng kết quả.
- Docker/Compose chưa có test tự động; kiểm tra thủ công bằng `docker compose config` và `docker compose --profile cache build && up` trước khi phát hành thay đổi `Dockerfile`/`compose.yaml`.

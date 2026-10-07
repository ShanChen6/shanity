# Sprint Payment: VietQR động và Bank Webhook

## 1. Mục tiêu

Sprint Payment triển khai luồng thanh toán chuyển khoản VietQR cho khóa học có
phí mà không phụ thuộc vào cổng thanh toán thu phí theo giao dịch.

Hệ thống cung cấp:

- mã VietQR riêng cho từng đơn hàng, chứa chính xác số tiền và mã đơn hàng;
- webhook nhận biến động giao dịch từ ngân hàng hoặc notification forwarder;
- xử lý webhook bất đồng bộ, chống lặp và an toàn khi có nhiều request đồng
  thời;
- tự động cấp quyền học sau khi giao dịch được máy chủ xác thực;
- API để frontend đọc trạng thái đơn hàng;
- worker tự động hết hạn đơn chưa thanh toán.

Đơn vị tiền tệ trong sprint này là VND. Mọi giá trị tiền được lưu dưới dạng số
nguyên, không sử dụng số thực.

## 2. Nguyên tắc bảo mật bắt buộc

> Chỉ webhook ngân hàng hoặc tiến trình polling phía server đã được xác thực mới
> được phép chuyển đơn hàng sang `COMPLETED` và tạo enrollment. Thông báo thành
> công từ frontend không phải bằng chứng thanh toán.

Các hệ quả của nguyên tắc này:

- Client không có API cập nhật trạng thái đơn hàng.
- `GET /orders/:id/status` chỉ đọc trạng thái và chỉ cho chủ đơn hàng truy cập.
- Webhook phải vượt qua `BankWebhookGuard` trước khi được xử lý.
- Việc hoàn tất đơn, ghi nhận giao dịch, tạo enrollment và đánh dấu webhook đã
  xử lý nằm trong cùng một database transaction.
- Số tiền và mã đơn được đối chiếu bằng dữ liệu do server lưu, không tin dữ liệu
  do frontend gửi lại.
- Khóa học có phí không thể dùng endpoint ghi danh miễn phí hiện có;
  `POST /courses/:courseId/enroll` chỉ chấp nhận khóa có `price = 0`.

## 3. Kiến trúc module

Module được đặt tại `apps/api/src/modules/payment` và gồm các thành phần sau:

| Thành phần | Trách nhiệm |
| --- | --- |
| `PaymentModule` | Đăng ký controller, service, guard và expiration worker |
| `OrdersController` | Tạo đơn và trả trạng thái đơn cho người dùng đã đăng nhập |
| `PaymentsController` | Nhận webhook VietQR từ hệ thống ngân hàng/forwarder |
| `PaymentService` | Sinh đơn, tạo QR, khóa đơn, đối soát và cấp enrollment |
| `BankWebhookGuard` | Xác thực header `x-api-key` bằng phép so sánh constant-time |
| `PaymentExpirationWorker` | Quét đơn `PENDING` hết hạn mỗi 5 phút |

`PaymentModule` được đăng ký trong `AppModule`. Ba entity thanh toán được đăng ký
trong TypeORM data source.

## 4. Mô hình dữ liệu

Migration của sprint là
`202610090001_vietqr_payments.ts` (`VietQrPayments1791504000001`).

### 4.1. Bảng `orders`

| Cột | Kiểu | Quy tắc |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `code` | `varchar(32)` | Unique, dùng làm nội dung chuyển khoản |
| `user_id` | `uuid` | FK đến `users.id` |
| `course_id` | `uuid` | FK đến `courses.id` |
| `amount` | `integer` | Số tiền VND, không âm |
| `status` | `OrderStatus` | Trạng thái vòng đời đơn hàng |
| `payment_method` | `PaymentMethod` | `VIETQR` hoặc `MANUAL_BANK` |
| `expires_at` | `timestamptz` | Mặc định do service đặt sau 15 phút |
| `created_at` | `timestamptz` | Thời điểm tạo |
| `updated_at` | `timestamptz` | Tự cập nhật khi entity thay đổi |

Các index chính:

- unique `orders_code_key` trên `code`;
- `orders_user_id_idx` hỗ trợ truy vấn đơn theo người dùng;
- `orders_pending_expiry_idx` trên `(status, expires_at)` phục vụ expiration
  worker.

### 4.2. Bảng `payment_transactions`

| Cột | Kiểu | Quy tắc |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `order_id` | `uuid` | FK đến `orders.id` |
| `provider_transaction_id` | `varchar(128)` | Mã giao dịch ngân hàng, unique khi khác `NULL` |
| `amount` | `integer` | Số tiền thực nhận, lớn hơn 0 |
| `transfer_content` | `text` | Nội dung chuyển khoản thực tế |
| `status` | `PaymentTransactionStatus` | `INITIATED`, `SUCCESS` hoặc `FAILED` |
| `raw_payload` | `jsonb` | Payload webhook phục vụ audit |
| `created_at` | `timestamptz` | Thời điểm ghi nhận |

Giao dịch thiếu tiền được lưu với trạng thái `FAILED`; giao dịch khớp hoặc lớn
hơn số tiền đơn hàng được lưu với trạng thái `SUCCESS`.

### 4.3. Bảng `bank_webhook_logs`

| Cột | Kiểu | Quy tắc |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `reference_code` | `varchar(128)` | Mã giao dịch ngân hàng, unique |
| `processed` | `boolean` | Đã kết thúc xử lý hay chưa |
| `created_at` | `timestamptz` | Thời điểm webhook được nhận |

Unique index trên `reference_code` là hàng rào idempotency ở cấp database. Cơ
chế này vẫn an toàn khi nhiều instance API nhận cùng một webhook đồng thời.

## 5. State machine

### 5.1. Trạng thái đơn hàng

```text
                    thiếu tiền
PENDING ─────────────────────────> PROCESSING
   │
   ├── webhook hợp lệ, đủ tiền ──> COMPLETED
   │
   ├── quá expires_at ───────────> EXPIRED
   │
   └── hủy bởi nghiệp vụ ────────> CANCELLED
```

Ý nghĩa trạng thái:

| Trạng thái | Ý nghĩa |
| --- | --- |
| `PENDING` | Đang chờ ngân hàng xác nhận thanh toán |
| `PROCESSING` | Đã nhận giao dịch nhưng số tiền chưa đủ, cần xử lý thủ công |
| `COMPLETED` | Đã xác thực đủ tiền và cấp quyền học |
| `EXPIRED` | Hết thời hạn thanh toán trước khi có giao dịch hợp lệ |
| `CANCELLED` | Đơn bị hủy theo nghiệp vụ |

Webhook chỉ tự động hoàn tất đơn đang ở `PENDING`. Webhook đến cho đơn đã hoàn
tất, hết hạn, bị hủy hoặc đang chờ xử lý thủ công được ghi nhận idempotency và
trả HTTP 200 nhưng không thay đổi enrollment.

### 5.2. Trạng thái giao dịch

- `INITIATED`: dành cho giao dịch đã khởi tạo nhưng chưa có kết quả cuối;
- `SUCCESS`: giao dịch nhận đủ số tiền yêu cầu;
- `FAILED`: giao dịch không đáp ứng điều kiện tự động hoàn tất, hiện gồm trường
  hợp thiếu tiền.

## 6. API contract

### 6.1. Tạo đơn VietQR

`POST /orders`

Guard: `SessionGuard`.

Request:

```json
{
  "courseId": "1f72bdae-88c4-4ced-b93d-af465d2e21eb"
}
```

Điều kiện:

- khóa học tồn tại và có trạng thái `published`;
- người dùng chưa có enrollment cho khóa học;
- `courseId` là UUID hợp lệ.

Response `201 Created`:

```json
{
  "orderId": "84d04c09-a956-45e4-b7d7-c6fe29727cb3",
  "code": "SHAN7K2M9Q",
  "amount": 250000,
  "expiresAt": "2026-10-07T05:30:00.000Z",
  "qrCodeUrl": "https://img.vietqr.io/image/970422-123456789-compact2.png?amount=250000&addInfo=SHAN7K2M9Q&accountName=SHANITY"
}
```

Mã đơn có dạng `SHAN` cộng 6 ký tự từ bảng chữ cái/số đã loại các ký tự dễ
nhầm. Service kiểm tra uniqueness trước khi lưu và database tiếp tục bảo vệ bằng
unique index.

Lỗi nghiệp vụ chính:

| HTTP | Thông báo | Nguyên nhân |
| --- | --- | --- |
| `400` | `ALREADY_ENROLLED` | Người dùng đã có enrollment |
| `401` | Unauthorized | Không có session hợp lệ |
| `404` | `COURSE_NOT_FOUND` | Khóa không tồn tại hoặc chưa public |
| `409` | `ORDER_CODE_GENERATION_FAILED` | Không sinh được mã duy nhất sau giới hạn retry |

### 6.2. Nhận webhook ngân hàng

`POST /payments/webhook/vietqr`

Guard: `BankWebhookGuard`.

Header bắt buộc:

```http
x-api-key: <BANK_WEBHOOK_API_KEY>
```

Request:

```json
{
  "transactionId": "FT26007123456789",
  "amount": 250000,
  "transferContent": "THANH TOAN SHAN7K2M9Q",
  "rawPayload": {
    "bank": "MB",
    "receivedAt": "2026-10-07T05:20:14.000Z"
  }
}
```

Response luôn dùng HTTP 200 sau khi request đã được xác thực và validate:

| `status` | Ý nghĩa |
| --- | --- |
| `COMPLETED` | Đơn đã hoàn tất và enrollment đã được cấp |
| `PARTIAL_AMOUNT` | Số tiền thiếu, đơn chuyển sang `PROCESSING` |
| `IGNORED` | Không có mã đơn phù hợp hoặc đơn không còn `PENDING` |
| `ALREADY_PROCESSED` | `transactionId` đã được tiếp nhận trước đó |

API trả `401 Unauthorized` khi thiếu API key, key cấu hình bị thiếu hoặc key
không khớp. DTO yêu cầu `transactionId` và `transferContent` là chuỗi không
rỗng; `amount` là số nguyên dương.

### 6.3. Đọc trạng thái đơn hàng

`GET /orders/:id/status`

Guard: `SessionGuard`.

Response `200 OK`:

```json
{
  "orderId": "84d04c09-a956-45e4-b7d7-c6fe29727cb3",
  "status": "COMPLETED",
  "expiresAt": "2026-10-07T05:30:00.000Z"
}
```

Server truy vấn đồng thời theo `id` và `user_id`; người dùng không thể đọc đơn
của tài khoản khác. Frontend có thể polling mỗi 3 giây và chỉ chuyển sang trang
khóa học khi server trả `COMPLETED`.

## 7. Quy trình xử lý webhook

Mỗi webhook hợp lệ chạy trong một TypeORM database transaction:

1. `INSERT ... ON CONFLICT DO NOTHING` vào `bank_webhook_logs` để claim
   `transactionId`.
2. Nếu claim thất bại, trả `ALREADY_PROCESSED` mà không chạy lại nghiệp vụ.
3. Tìm mã đơn bằng regex `SHAN[A-Z0-9]+` trong `transferContent`.
4. Đọc order bằng pessimistic write lock (`SELECT ... FOR UPDATE`).
5. Nếu đơn không tồn tại hoặc không còn `PENDING`, đánh dấu log đã xử lý và trả
   `IGNORED`.
6. Nếu đơn đã quá `expires_at`, chuyển sang `EXPIRED`, không cấp enrollment.
7. Ghi `payment_transactions` cùng raw payload.
8. Nếu thiếu tiền, chuyển đơn sang `PROCESSING` và trả `PARTIAL_AMOUNT`.
9. Nếu đủ tiền, chuyển đơn sang `COMPLETED`, insert enrollment bằng
   `ON CONFLICT DO NOTHING`, rồi đánh dấu webhook đã xử lý.
10. Commit toàn bộ thay đổi cùng lúc.

Nếu có lỗi trước commit, transaction rollback cả webhook claim. Hệ thống ngân
hàng có thể retry cùng `transactionId` mà không làm mất giao dịch.

## 8. Sinh VietQR động

URL ảnh QR sử dụng định dạng:

```text
https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png
  ?amount=<AMOUNT>
  &addInfo=<ORDER_CODE>
  &accountName=<ACCOUNT_NAME>
```

Các query parameter được tạo bằng `URLSearchParams`; bank ID và số tài khoản
được URL-encode trước khi ghép path. `addInfo` luôn lấy từ `order.code` do server
sinh, vì vậy nội dung thanh toán không phụ thuộc vào dữ liệu client.

## 9. Expiration worker

`PaymentExpirationWorker` chạy mỗi 5 phút và thực hiện một câu lệnh update theo
tập hợp:

```sql
UPDATE orders
SET status = 'EXPIRED'
WHERE status = 'PENDING'
  AND expires_at < now();
```

Timer được `unref()` để không giữ process khi ứng dụng shutdown. Lỗi của một
lần quét được ghi bằng Nest logger và không tạo unhandled promise rejection.

Ngoài worker định kỳ, webhook cũng kiểm tra `expires_at` sau khi khóa order. Vì
vậy webhook đến trong khoảng giữa hai lần quét không thể hoàn tất một đơn đã
hết hạn.

## 10. Cấu hình môi trường

Thêm các biến sau vào `.env`:

```dotenv
VIETQR_BANK_ID=970422
VIETQR_ACCOUNT_NO=123456789
VIETQR_ACCOUNT_NAME=SHANITY
BANK_WEBHOOK_API_KEY=replace-with-a-long-random-secret
```

| Biến | Mục đích | Lưu ý |
| --- | --- | --- |
| `VIETQR_BANK_ID` | Mã BIN hoặc mã ngân hàng VietQR | Ví dụ `970422` |
| `VIETQR_ACCOUNT_NO` | Số tài khoản nhận tiền | Không commit dữ liệu thật |
| `VIETQR_ACCOUNT_NAME` | Tên chủ tài khoản hiển thị trong QR | Dùng đúng tên ngân hàng |
| `BANK_WEBHOOK_API_KEY` | Secret xác thực webhook | Bắt buộc, sinh ngẫu nhiên và lưu trong secret manager |

Không đặt API key trong frontend, query string, source code hoặc log. Khi thay
key, cần phối hợp cập nhật forwarder và API để tránh làm gián đoạn webhook.

## 11. Migration và triển khai

Từ thư mục gốc repository:

```bash
pnpm --filter api build
pnpm --filter api db:migrate
pnpm --filter api start:prod
```

Trình tự production khuyến nghị:

1. Sao lưu database và thử restore.
2. Cấu hình bốn biến môi trường thanh toán.
3. Chạy migration trước khi cập nhật API.
4. Khởi động API và kiểm tra `/health/db`.
5. Gửi một webhook thử nghiệm với mã giao dịch duy nhất.
6. Xác minh order, transaction, webhook log và enrollment trong database.

Migration `down` xóa dữ liệu thanh toán, vì vậy không rollback migration này
trên production khi chưa có backup và kế hoạch phục hồi rõ ràng. Ưu tiên sửa
bằng forward migration.

## 12. Kiểm thử

Integration suite nằm tại
`apps/api/test/modules/payment/vietqr-payment.spec.ts` và bao phủ:

| Kịch bản | Kỳ vọng |
| --- | --- |
| Happy path | Tạo QR đúng số tiền/mã đơn, webhook hoàn tất order và tạo enrollment |
| Idempotency | Gửi cùng `transactionId` 5 lần nhưng chỉ có một transaction và một enrollment |
| Partial amount | Order chuyển `PROCESSING`, không cấp enrollment |
| Security | Client không thể tự cập nhật `COMPLETED`; API key sai bị từ chối |

Các lệnh kiểm tra:

```bash
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
pnpm --filter api test:e2e -- test/modules/payment/vietqr-payment.spec.ts
```

Integration test dùng PostgreSQL thật và chỉ chạy khi `PGDATABASE` kết thúc bằng
`_test`. Phải migrate database test trước khi chạy:

```bash
PGDATABASE=shanity_test pnpm --filter api db:migrate
PGDATABASE=shanity_test pnpm --filter api test:e2e -- test/modules/payment/vietqr-payment.spec.ts
```

Trên PowerShell:

```powershell
$env:PGDATABASE = 'shanity_test'
pnpm --filter api db:migrate
pnpm --filter api test:e2e -- test/modules/payment/vietqr-payment.spec.ts
```

## 13. Giám sát và xử lý sự cố

Nên theo dõi tối thiểu các chỉ số sau:

- số webhook nhận được, bị từ chối và trùng lặp;
- số đơn theo từng trạng thái;
- thời gian từ khi tạo order đến khi `COMPLETED`;
- số giao dịch `FAILED` và đơn `PROCESSING` cần đối soát;
- lỗi expiration worker;
- tỷ lệ webhook không tìm thấy mã đơn.

Checklist khi khách đã chuyển tiền nhưng chưa được cấp khóa học:

1. Tìm `transactionId` trong `bank_webhook_logs`.
2. Kiểm tra `processed` và raw payload trong `payment_transactions`.
3. Đối chiếu `transfer_content`, `amount`, `order.code` và `order.amount`.
4. Kiểm tra order có hết hạn hoặc đã ở `PROCESSING` hay không.
5. Kiểm tra enrollment hiện có, bao gồm `revoked_at`.
6. Không sửa trực tiếp order sang `COMPLETED` nếu chưa xác minh giao dịch ngân
   hàng.

## 14. Giới hạn hiện tại

- Mỗi order chỉ chứa một khóa học.
- Chưa hỗ trợ cộng dồn nhiều giao dịch thiếu tiền cho cùng một order.
- Đơn `PROCESSING` cần quy trình đối soát thủ công ở sprint sau.
- Chưa có refund, chargeback hoặc hủy enrollment theo hoàn tiền.
- Webhook hiện xác thực bằng API key; chữ ký HMAC theo raw request body có thể
  được bổ sung khi forwarder hỗ trợ.
- Chưa có server-side bank polling dự phòng khi webhook bị gián đoạn.

Các phần mở rộng trên phải tiếp tục tuân thủ invariant: chỉ bằng chứng thanh
toán đã được backend xác thực mới được phép tạo hoặc kích hoạt enrollment.

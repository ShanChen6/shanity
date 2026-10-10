# Cơ sở dữ liệu

PostgreSQL 17, truy cập bằng **TypeORM 1.1 + pg**. Schema do migration TypeScript có kiểm soát; **không** đồng bộ schema tự động, không chạy migration khi khởi động, không tự cài extension (migration cần `uuid-ossp` tự cài tường minh). Mọi cột thời gian là `timestamptz`; session PostgreSQL dùng UTC.

## Chạy và duy trì

```bash
pnpm --filter api db:migrate     # áp dụng migration chưa chạy; chạy lại báo "Already up to date"
pnpm --filter api db:seed        # seed phát triển
pnpm --filter api test:database  # test migration (cần DB tên kết thúc _test)
```

Các lệnh `db:*` biên dịch API rồi chạy `apps/api/database/cli.mjs`. Trong Docker, service `migrate` chạy `migrate` rồi `seed-admin`. **Luôn chạy migration qua `cli.mjs`**: runner giữ advisory lock của PostgreSQL trên cùng kết nối với `MigrationExecutor`, kiểm tra lịch sử, và chạy các migration chờ trong một transaction. `dist/database/data-source.js` chỉ dành cho công cụ metadata của TypeORM.

- Lịch sử nằm trong bảng `typeorm_migrations`. Migration đặt tại `apps/api/src/database/migrations/<yyyymmddnnnn>_<tên>.ts` và **phải được đăng ký theo thứ tự thời gian** trong `migrations/index.ts`.
- Không sửa migration đã áp dụng; sửa bằng migration tiến. Bảy ánh xạ migration Knex cũ phải giữ nguyên.
- Tên bảng/cột `snake_case`, khóa chính UUID. Mọi khóa ngoại có `ON DELETE` tường minh; đa số là `RESTRICT` để lịch sử không bị xóa dây chuyền (`CASCADE` chỉ cho quan hệ sở hữu như chương/khóa, ghi danh/người dùng-khóa, tiến độ).
- Entity chỉ mô tả tính năng đang dùng; khi sinh SQL tự động phải xem lại để không làm mất bảng, ràng buộc hay trigger lịch sử không có trong metadata.
- Giá trị đọc từ `bigint` qua `bigintNumberTransformer`; trigger sinh dấu thời gian nên cần nạp lại sau khi ghi bằng ORM nếu muốn thấy giá trị mới.

### Lùi migration

`pnpm --filter api db:revert` chỉ lùi migration **gần nhất**. Nhiều migration cố ý từ chối `down()` phá hủy dữ liệu (ví dụ khi đã có đơn nhiều khóa, giao dịch không phải VietQR…); khi đó dùng migration tiến hoặc khôi phục từ backup đã kiểm chứng.

### Nâng cấp database có lịch sử Knex

Không chạy container migration Knex cũ cùng lúc với bản mới. Sao lưu, thử trên bản khôi phục, rồi:

```bash
pnpm --filter api db:adopt-legacy
# Docker:
docker compose build migrate
docker compose run --rm migrate node database/cli.mjs adopt-legacy
docker compose up -d --build
```

Lệnh yêu cầu tiền tố liên tục của bảy tên migration Knex đã biết, sổ cái Knex không bị khóa và các bảng/cột nền như kỳ vọng; nó chỉ sao chép định danh vào `typeorm_migrations` rồi chạy tiếp các migration còn lại. Lịch sử lạ hoặc thiếu cột nền thì thất bại thay vì chấp nhận ngầm. `knex_migrations` và `knex_migrations_lock` được giữ làm lưu trữ.

## Các nhóm bảng

| Nhóm | Bảng | Ghi chú chính |
| --- | --- | --- |
| Danh tính | `users`, `auth_identities`, `auth_sessions`, `oauth_requests`, `auth_rate_limits` | `users.email` chuẩn hóa, unique; `password_hash` nullable (tài khoản chỉ Google); `status` active/disabled; `avatar_key`. Danh tính unique `(provider, provider_subject)`; không lưu OAuth token. Refresh token chỉ lưu SHA-256 |
| Phân quyền | `roles`, `user_roles`, `course_instructors` | Vai trò `student`, `instructor`, `admin`, `finance_officer`; nhiều vai trò/người; phân công dạy `unique(course_id, user_id)` |
| Khóa học | `courses`, `chapters`, `lessons`, `course_price_logs`, `course_media`, `enrollments` | `courses.owner_id` (nullable), `status`, `access_type` FREE/PAID, `price`, `currency`, `is_sequential`, `live_attendance_threshold`. `lessons` thuộc chương (`chapter_id`); `course_sections` và `lesson_assets` là bảng kế thừa còn giữ; thumbnail lưu bytes trong `course_media`. `enrollments` unique `(user_id, course_id)`, `revoked_at` giữ lịch sử |
| Tiến độ | `lesson_progress` | Unique `(user_id, lesson_id)`; composite FK `(lesson_id, course_id)` chặn lệch khóa; các cột `started_at`, `last_accessed_at`, `completed_at`, vị trí tiếp tục |
| Quiz | `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `attempt_answers`, `quiz_grade_audit_logs` | `scope + target_id` tham chiếu có kiểu (kiểm tra bằng trigger); snapshot đề trong `quiz_attempts`; `essay_config`/`essay_answer`/`grading` là JSONB; nhật ký chấm chỉ-ghi-thêm |
| Thanh toán | `orders`, `order_items`, `payment_transactions`, `webhook_logs`, `order_audit_logs` | Tiền `bigint` đơn vị nhỏ nhất; snapshot bất biến; sổ cái; nhật ký kiểm toán bất biến. `bank_webhook_logs` cũ không còn được ghi nhưng được giữ |
| Chat | `chat_messages`, `chat_reports`, `chat_mutes`, `chat_moderation_logs` | Phòng gắn với khóa (không có bảng phòng); index `(course_id, created_at, id)` cho phân trang. Bảng `chat_rooms/chat_members/messages` cũ đã bị xóa |
| Blog | `posts`, `categories`, `post_review_logs`, `post_comments`, `post_comment_review_logs`, `blog_images` | Enum `BlogPostStatus`; trigger chặn chuyển trạng thái sai; `slug` bị đóng băng sau lần xuất bản đầu |
| Lớp trực tiếp | `live_sessions`, `live_attendances` | Cửa sổ `[start_time, end_time)`; điểm danh cộng dồn bằng heartbeat |

## Bảo đảm ở tầng database

Các bất biến sau được cưỡng chế bằng CHECK, unique, composite FK hoặc trigger — dù ai đó chạy SQL trực tiếp cũng không phá được:

- **Tiền & đơn hàng**: `final_total = subtotal − discount_total`; `order_items` bất biến và chỉ thêm được vào đơn `PENDING`; header đơn bất biến ở các cột tài chính; tổng item khớp tổng đơn kiểm tra lúc COMMIT (constraint trigger hoãn); máy trạng thái đơn; `→ COMPLETED` chỉ khi tổng giao dịch `SUCCESS` ≥ `final_total`; mỗi lần đổi `status` kéo theo một dòng `order_audit_logs`; `payment_transactions` chỉ dòng `INITIATED` được cập nhật (một lần); `order_audit_logs` từ chối `UPDATE/DELETE/TRUNCATE`. Xem [payments](payments.md).
- **Giá**: `FREE ⇔ price = 0`, `PAID ⇔ price > 0` (`courses_access_type_price_check`); tiền tệ `VND|USD`.
- **Quiz**: ràng buộc `scope/target`; phiên bản đã có bài làm bất biến; một lượt làm `IN_PROGRESS` cho mỗi cặp quiz–người dùng (partial unique); đáp án chỉ ghi khi lượt làm còn mở. Xem [quiz](quiz.md).
- **Bài học**: `lessons_parent_check` (đúng một cha: chương hoặc phần kế thừa); dữ liệu theo từng loại bài (văn bản/video/tài liệu) có discriminator kiểm tra.
- **Blog**: máy trạng thái bài viết; nhật ký duyệt chỉ-ghi-thêm.
- **Chuẩn audit**: `set_updated_at()` giữ `updated_at`; test `audit-standard.spec.ts` yêu cầu mọi entity có khóa UUID và cột audit trừ các ngoại lệ có lý do.

## Dữ liệu seed

| Lệnh | Nội dung | Production |
| --- | --- | --- |
| `seed-admin` | Tạo super admin từ `SUPER_ADMIN_*` (không ghi đè mật khẩu admin đã có) | Có, bắt buộc có biến |
| `seed` | Khóa demo cố định + khóa JavaScript mẫu + tài khoản demo + super admin | Không dùng |
| `seed-course` | Khóa JavaScript mẫu | Không dùng |
| `seed-demo` | `admin@`, `instructor@`, `student@`, `finance@shanity.local`; khóa đã xuất bản, khóa nháp, ghi danh, một bài đã hoàn thành, một quiz tự luận có bài chờ chấm | Từ chối khi `NODE_ENV=production` |

Mọi seed dùng id cố định và `ON CONFLICT` nên chạy lại không đổi gì; tài khoản có sẵn giữ nguyên mật khẩu, vai trò chỉ được thêm.

## Sao lưu và vận hành

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > shanity-backup.dump
```

File backup chứa dữ liệu cá nhân: không commit. Quy trình an toàn khi đổi schema trên dữ liệu thật: sao lưu → khôi phục sang môi trường thử → so sánh schema/số lượng/ràng buộc → viết migration theo kiểu *expand → backfill → validate → switch*.

Production nên dùng tài khoản runtime ít quyền tách khỏi tài khoản migration, kết nối TLS, quản lý secret và lịch backup/khôi phục thử. Compose chỉ bind PostgreSQL vào `127.0.0.1` và phục vụ local. Đổi `POSTGRES_*` không sửa database đã khởi tạo trong volume. Sao lưu volume `avatar_data` (và thư mục media bài học) cùng PostgreSQL.

## Kiểm thử

`pnpm --filter api test:database` (`database/typeorm.test.mjs`) cần PostgreSQL có database tên kết thúc `_test`; mỗi test tạo và xóa schema ngẫu nhiên riêng. Bao phủ: migration trên DB trống và chạy đồng thời, `adopt-legacy` (kể cả từ chối lịch sử lạ), Up/Down/Up, ràng buộc và quan hệ của `Course`, seed idempotent. Fixture `legacy-schema.sql` mô tả schema trước TypeORM độc lập với các migration mới.

> `pnpm --filter api db:verify` (`database/verify.mjs`) đã lỗi thời so với schema hiện tại (kỳ vọng ba vai trò và `lessons` không có `chapter_id`); dùng `test:database` thay thế.

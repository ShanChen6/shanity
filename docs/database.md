# PostgreSQL — nền tảng giai đoạn 0

> The entire backend now uses TypeORM. See [TypeORM setup and legacy upgrade](typeorm.md)
> for current commands and [Course schema](course-schema.md) for C2. Historical
> verification records below describe the earlier implementation.

## Phạm vi và lựa chọn

Backend dùng NestJS 12/TypeScript ESM và **TypeORM + pg**, với migration có transaction/lock và không đồng bộ schema tự động. Migration SQL rõ ràng giữ các composite foreign key. Node 24 chạy JavaScript đã biên dịch; xem [hướng dẫn TypeORM](typeorm.md) trước khi nâng cấp database đã có lịch sử Knex.

Auth + User đã được triển khai; xem [hướng dẫn Auth](auth.md) để cấu hình JWT_SECRET, WEB_ORIGIN và thời hạn token trước khi chạy API. `GET /health/db` thực hiện SELECT 1, trả 200 hoặc 503 không tiết lộ lỗi kết nối. API kiểm tra kết nối trước khi listen và đóng pool khi shutdown. Khi chạy trực tiếp, DB chưa sẵn sàng thì API dừng; chạy lại sau khi DB healthy. Compose chờ healthcheck và migration hoàn tất trước khi chạy API.

## Chạy trên máy

Từ thư mục gốc, Node 24 và pnpm:

1. `cp .env.example .env`, thay `PGPASSWORD` bằng mật khẩu riêng. Mẫu chỉ là placeholder. Giữ `PGHOST=localhost`; nếu đổi cổng DB, sửa `PGPORT`.
2. `docker compose up -d --wait postgres`
3. `pnpm install --frozen-lockfile`
4. `pnpm --filter api db:migrate`
5. `pnpm --filter api db:seed` (tạo admin ban đầu nếu đã cấu hình `SUPER_ADMIN_EMAIL` và `SUPER_ADMIN_PASSWORD`)
6. `pnpm dev:api`
7. `curl http://localhost:4000/health/db`

API và CLI đọc `.env` gốc dựa trên đường dẫn module. Biến môi trường đã export ưu tiên hơn file. `PORT` là cổng API khi chạy trực tiếp (mặc định 4000); `API_PORT` chỉ ánh xạ cổng Compose. PostgreSQL session dùng UTC; mọi thời điểm trong schema là timestamptz.

## Chạy toàn bộ bằng Compose

Sau khi tạo `.env` và thay `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` bằng thông tin riêng: `docker compose up --build -d`. Service `postgres` có volume và healthcheck; `migrate` chạy migration rồi seed admin ban đầu trước khi thoát 0; API dùng hostname `postgres`, cổng nội bộ 5432 dù host đổi cổng. Mật khẩu chỉ dùng để tạo tài khoản mới, được lưu dưới dạng scrypt hash; chạy lại seed không đổi mật khẩu của tài khoản đã tồn tại. Không đưa `.env` hoặc secret vào Git và nên dùng secret manager khi triển khai production. Để có thêm dữ liệu demo trong môi trường phát triển:

```bash
docker compose run --rm -e NODE_ENV=development migrate node database/cli.mjs seed
curl http://localhost:4000/health/db
docker compose logs migrate api
```

Dữ liệu demo theo vai trò (chỉ dành cho phát triển/kiểm thử, **từ chối chạy khi `NODE_ENV=production`**): `pnpm --filter api seed:demo` (hoặc `node database/cli.mjs seed-demo`). Lệnh tạo `admin@`, `instructor@`, `student@` và `finance@shanity.local`, một khóa học đã xuất bản kèm bài học, một khóa nháp, ghi danh của học viên và một quiz tự luận có bài làm chờ chấm. Mật khẩu lấy từ `SEED_DEMO_PASSWORD`, mặc định `Shanity-Demo-2026!`; chạy lại không đổi mật khẩu của tài khoản đã tồn tại. Chuẩn cột audit của schema (UUID, `created_at`, `updated_at`, các ngoại lệ có lý do) được `test/database/audit-standard.spec.ts` cưỡng chế; xem [báo cáo kiểm toán](architecture/pre-release-system-audit.md) cho các quyết định (ví dụ vì sao không dùng soft delete đồng loạt).

Khi triển khai phiên bản có migration mới, chạy `docker compose run --rm migrate` trước khi cập nhật API. Không chạy nhiều phiên bản ứng dụng không tương thích schema cùng lúc. Seeder admin yêu cầu env trong production; seeder dữ liệu demo tự bỏ qua production. Role `admin` hiện là quyền quản trị tài khoản trong ứng dụng. Seeder chỉ cấp role này cho email cấu hình và không thay đổi mật khẩu nếu tài khoản đã tồn tại. Seed demo tạo một khóa nháp, một chương, một bài văn bản; UUID cố định và ON CONFLICT DO NOTHING nên không ghi đè nội dung đã sửa. Xung đột slug/position với dữ liệu khác sẽ báo lỗi và rollback toàn bộ seed để kiểm tra thủ công.

`docker compose down` giữ dữ liệu; **không dùng `down -v` với dữ liệu cần giữ**. Thay POSTGRES_USER/PASSWORD/DB trong env không sửa database đã khởi tạo trong volume.

## Các bảng đã triển khai

| Nhóm       | Bảng và quan hệ                                                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh tính  | `users`: UUID, email chuẩn hóa lowercase/trim và unique, hash mật khẩu nullable; `auth_identities`: nhiều danh tính trên một user, unique(provider, provider_subject), không lưu OAuth token                                                              |
| Phân quyền | `roles`, `user_roles`; `courses.owner_id` nullable để giữ khóa cũ; `course_instructors` phân công giảng viên, tách khỏi quyền sở hữu; xem [ma trận quyền](permissions.md)                                                                                 |
| Nội dung   | `courses` → `course_sections` → `lessons` → `lesson_assets`; slug khóa unique, position không âm và unique trong cha; `lessons.is_preview` cho phép truy cập nội dung xem trước; tài nguyên chỉ lưu storage key, không lưu file hoặc signed URL |
| Ghi danh   | `enrollments`: unique(user_id, course_id), FK user/course cascade; giữ `revoked_at` lịch sử và composite key được `lesson_progress` tham chiếu                                                                                                            |
| Tiến độ    | `lesson_progress`: PK(enrollment_id, lesson_id); composite FK đảm bảo enrollment và lesson cùng khóa; last_position_seconds là vị trí tiếp tục, watched_seconds là thời lượng do ứng dụng tính, completed_at độc lập; updated_at tự cập nhật bằng trigger |
| Blog       | `posts` có tác giả, slug unique, draft/review/published/archived; published cần published_at; `categories` và `post_categories` nhiều–nhiều                                                                                                               |
| Chat       | `chat_rooms` luôn thuộc khóa; `chat_members` unique(room_id,user_id); `messages` FK đến thành viên cùng phòng, index(room_id,created_at,id) để phân trang lịch sử                                                                                         |

UUID hiện có dùng `gen_random_uuid()`; chapter và enrollment UUID dùng `uuid_generate_v4()` từ extension `uuid-ossp`. FK mặc định RESTRICT để bảo vệ lịch sử, ngoại trừ chapter/course và enrollment/user-course được cấu hình CASCADE theo schema mới. Index riêng trên enrollment user/course hỗ trợ hai hướng tra cứu. Chưa triển khai hard-delete tài khoản hoặc tự động xóa lịch sử.

Ghi danh miễn phí chỉ nhận khóa học `published` có `price = 0`; `POST /courses/:courseId/enroll` và `GET /courses/:courseId/enrollment-status` yêu cầu Student session. UNIQUE(user_id, course_id) bảo vệ dữ liệu khi hai yêu cầu đồng thời; API chuyển xung đột thành HTTP 409. `CourseAccessService` cho phép bài preview không cần đăng nhập và yêu cầu enrollment chưa bị thu hồi cho bài được bảo vệ. FK chat không tự cấp quyền vào phòng theo enrollment. Danh mục vai trò đã có; không tự cấp vai trò cho tài khoản. Xem [ma trận quyền đã chốt](permissions.md). Email OAuth phải được xác minh ở tầng auth trước khi liên kết; không tự ghép tài khoản chỉ dựa trên email.

## Thiết kế đề xuất chưa tạo bảng

README còn để mở quy tắc quiz, chấm lại và người thanh toán. Trì hoãn DDL các nhóm này để chốt hợp đồng dữ liệu trước, thay vì áp đặt quy tắc không có trong mã:

- **Quiz:** `quizzes(course_id, lesson_id?)` → `quiz_versions(quiz_id, version)` → `questions(version_id, kind, prompt, max_score NUMERIC)` → `question_options(question_id, position, body, is_correct)`. Kind gồm trắc nghiệm và tự luận. `quiz_attempts(version_id, enrollment_id, attempt_number, submitted_at, status)` unique(enrollment_id, version_id, attempt_number); `answers(attempt_id, question_id, essay_text, awarded_score NUMERIC)` unique(attempt_id,question_id); `answer_options(answer_id, option_id)` hỗ trợ nhiều đáp án. Composite FK phải chặn câu hỏi ngoài version và option ngoài câu hỏi. Version đã có lượt làm phải bất biến; chấm tự luận có điểm nullable và trạng thái pending, lịch sử chấm riêng `grade_revisions`. Cần chốt một/nhiều đáp án đúng, giới hạn lượt làm theo quiz hay version, snapshot, công bố điểm và quy tắc sửa điểm.
- **Thanh toán:** `orders(buyer_id, currency, total_minor BIGINT, status)` → `order_items(order_id, course_id, title_snapshot, amount_minor BIGINT)`; `payments(order_id, provider, provider_reference, status, amount_minor BIGINT)` unique(provider,provider_reference); `payment_events(provider,event_id,payment_id,processed_at)` unique(provider,event_id). Tiền không âm, không dùng float; không lưu PAN/CVV hoặc payload thẻ. Tham chiếu giao dịch chỉ unique trong nhà cung cấp. Webhook xác minh và cấp enrollment trong transaction chống xử lý lặp; trạng thái dự kiến pending/succeeded/failed/cancelled, refund tách bản ghi khi chốt hoàn tiền. Cần chốt người mua/người học, tiền tệ/đơn vị nhỏ nhất, giỏ nhiều khóa, hoàn tiền một phần và cổng thanh toán.
- **Auth mở rộng:** Session/JWT refresh token và liên kết phụ huynh cần thiết kế riêng. Vai trò, chủ sở hữu và phân công giảng viên đã được bổ sung theo [ma trận quyền](permissions.md).
- **Blog/chat mở rộng:** chốt duyệt bài, audit người duyệt, liên kết bài–khóa, báo cáo/ẩn tin nhắn, lưu trữ lịch sử và quản trị viên vào phòng trước khi thêm bảng tương ứng. Chưa hỗ trợ chat cá nhân.

## Migration an toàn và sao lưu

Hai migration đầu tạo bảng; migration 003 bổ sung roles, user_roles, course_instructors, owner_id nullable và mở rộng CHECK trạng thái khóa/blog để nhận review/hidden. TypeORM quản lý lịch sử, runner giữ PostgreSQL advisory lock và không synchronize. Database đã dùng Knex cần chạy bước [adopt-legacy](typeorm.md). Nếu bảng đã tồn tại nhưng không có lịch sử phù hợp, migration báo lỗi thay vì tự nhận schema.

Với DB hiện hữu: sao lưu, restore sang môi trường thử, so sánh schema/count/constraints, viết migration chuyển đổi riêng theo expand → backfill → validate → switch; chỉ baseline lịch sử sau khi xác minh tương đương. Không sửa migration đã áp dụng. Rollback phá hủy bị vô hiệu hóa chủ động; sửa bằng forward migration hoặc restore backup đã kiểm chứng.

Ví dụ backup cục bộ (file có dữ liệu cá nhân, không commit):

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /tmp/shanity-backup.dump
```

Production cần tài khoản runtime ít quyền tách khỏi tài khoản migration, quản lý secrets, kết nối TLS theo hạ tầng và lịch backup/restore thử. Compose hiện phục vụ local, chỉ bind PostgreSQL trên 127.0.0.1.

## Kiểm tra

```bash
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api db:verify
pnpm --filter api test:e2e
```

Các lệnh tích hợp cần DB đã migrate và env hợp lệ. `db:verify` dùng transaction rollback, kiểm tra unique, FK khác khóa, giá trị âm, completion độc lập và hạn chế xóa. E2E dùng PostgreSQL thật, kiểm tra `/` và `/health/db`.

## Kết quả xác minh trong lần triển khai này

- PostgreSQL 17 chạy bằng Compose project riêng `shanity-db-verification`, host port 55439, volume riêng; không truy cập hoặc sửa database đang có của người dùng.
- `db:migrate` áp dụng 2 migration trên DB trống, lần hai báo Already up to date.
- `db:seed` chạy hai lần: vẫn đúng 1 khóa, 1 chương, 1 bài, không có tài khoản mẫu.
- `db:verify` qua các kiểm tra unique/FK/check/delete, chat membership và điều kiện xuất bản blog.
- API `build`, `lint`, `test` (1 test), `test:e2e` (2 test) đều qua.
- `docker compose ... config --quiet`, `build api`, `up -d --build api` thành công; Docker build đã build cả API và web bằng Node 24, frozen lockfile pnpm 11.24.0. Host dùng Node 25.9.0/pnpm 11.18.0.
- Backend build chạy trực tiếp trên port 55440 và container trên port 55441 trả `{ "status": "ok" }`; dừng PostgreSQL thì endpoint container trả 503 với thông báo chung.
- Lần thử port 4000 gặp `EADDRINUSE`; đã kiểm tra lại thành công ở port riêng, không dừng dịch vụ đang chiếm cổng. Lỗi import named export của Knex phát hiện khi thử Node ESM đã sửa bằng default import. CLI migration trong Compose gọi trực tiếp Node để tránh pnpm tự cài dependency lúc runtime.
- Đã dừng container/tiến trình kiểm thử; volume kiểm thử được giữ lại. Không thay đổi các artifact dist đang được Git theo dõi; cần build trước khi dùng start:prod.

### Xác minh bổ sung ma trận quyền

Migration 003 đã áp dụng thành công trên volume kiểm thử có hai migration cũ và dữ liệu seed; chạy lại báo Already up to date. Khóa demo vẫn draft, owner_id vẫn NULL và user_roles rỗng: không tự đổi dữ liệu nghiệp vụ hoặc cấp quyền. Trên database kiểm thử trống `shanity_access_fresh`, cả ba migration, seed và db:verify đều thành công. Các kiểm tra mới bao gồm danh mục role, FK role/user, gán role/giảng viên không trùng, owner FK và tập trạng thái khóa. Chỉ thay đổi SQL/test script/tài liệu nên không chạy lại build TypeScript. Đã dừng Compose kiểm thử và giữ volume.

Migration 004 bổ sung users.status và bảng auth_sessions, oauth_requests, auth_rate_limits. Xem [Auth](auth.md) cho cookie, rotation, OAuth và kiểm tra quyền hiện hành.

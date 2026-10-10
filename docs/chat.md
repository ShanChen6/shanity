# Chat theo khóa học

Mỗi khóa học có một phòng chat nhóm. Tin nhắn được **lưu trong PostgreSQL** (nguồn sự thật, có lịch sử) và **phát thời gian thực qua Pusher Channels**. API không giữ socket nên chạy được trên hạ tầng serverless và nhiều instance. Chưa có chat cá nhân giữa các học viên.

## Ai là thành viên phòng

`ChatAccessService.memberFor(userId, courseId)` trả lời **luôn từ database** (không cache), nên thu hồi ghi danh hay gỡ phân công có hiệu lực ngay ở request kế tiếp:

| Người dùng | Điều kiện | Vai trò trong phòng |
| --- | --- | --- |
| Giảng viên của khóa (chủ sở hữu, `instructor_id` hoặc được phân công) | Bất kể trạng thái khóa | `instructor` |
| Học viên | Ghi danh còn hiệu lực **và** khóa đã `published` | `student` |

Các từ chối: `404 COURSE_NOT_FOUND`, `403 COURSE_UNAVAILABLE` (khóa chưa xuất bản), `403 ENROLLMENT_REQUIRED`, `403 ENROLLMENT_SUSPENDED`. **Vai trò nền tảng không phải tư cách thành viên**: admin không có quan hệ giảng dạy hay ghi danh với khóa thì bị từ chối vào phòng như bất kỳ ai; kiểm duyệt có endpoint riêng.

`ChatEnrollmentGuard` áp dụng cùng quy tắc cho cả xác thực kênh, đọc lịch sử và gửi tin.

## Thời gian thực (Pusher)

- Kênh **presence** `presence-course-<courseId>` (UUID chữ thường — Pusher phân biệt hoa thường). Cấu hình Pusher app phải **tắt "Client events"**: mọi tin phải đi qua API để được kiểm tra và kiểm duyệt; client chỉ lắng nghe.
- Trình duyệt xin quyền vào kênh qua `POST /api/v1/chat/auth` (`socket_id`, `channel_name`); API xác thực thành viên rồi ký bằng `PUSHER_SECRET`. Chưa cấu hình Pusher → 503.
- Sự kiện API phát: `message_created` (một `ChatMessageView`), `message_hidden` (`{ messageId }`), `user_muted` (`{ userId, mutedUntil }`). Phát tin là *best effort* — tin đã bền trong database; client lỡ sự kiện sẽ bắt kịp bằng lịch sử.
- Web (`features/chat`): nếu thiếu `NEXT_PUBLIC_PUSHER_KEY/CLUSTER` phòng chạy bằng polling và hiện trạng thái "Mất kết nối"; `ConnectionStatusBadge` cho biết trạng thái kết nối; khi kết nối lại client tải phần mới bằng `after`.

## API

Mọi route yêu cầu phiên; nhóm theo khóa dùng `ChatEnrollmentGuard`.

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/v1/courses/:courseId/chat/me` | Vị trí của tôi trong phòng: `role`, `mutedUntil` |
| `GET /api/v1/courses/:courseId/chat/messages` | Lịch sử phân trang theo keyset `(created_at, id)`: `cursor` (cũ hơn, cuộn lên), `after` (mới hơn, bắt kịp; không dùng chung với `cursor` — `CHAT_CURSOR_CONFLICT`), `limit` (mặc định 30, tối đa 100). Luôn trả **cũ → mới**, kèm `hasMore`. Học viên không thấy tin `HIDDEN` hay việc tin bị `FLAGGED`; giảng viên thấy cả hai |
| `POST /api/v1/courses/:courseId/chat/messages` | Gửi tin (≤ **2000** ký tự). Qua `ChatMuteGuard` và `ChatRateLimitGuard` |
| `POST /api/v1/chat/auth` | Xác thực kênh Pusher |
| `POST /api/v1/chat/messages/:id/report` | Báo cáo tin `{ reason ≤ 1000 }` |
| `PATCH /api/v1/chat/messages/:id/hide` | Ẩn tin (kiểm duyệt) |
| `POST /api/v1/chat/messages/:id/dismiss` | Bác báo cáo, khôi phục tin về `ACTIVE` |
| `GET /api/v1/chat/moderation/queue` | Hàng chờ tin bị báo cáo (tối đa 100 mục/lần đọc) |
| `POST /api/v1/chat/users/:userId/mute` | Cấm chat `{ courseId, durationMinutes ≤ 30 ngày, reason? }` |

**Giới hạn tần suất**: 5 tin / 3 giây / người dùng; vượt → `429 CHAT_RATE_LIMITED` kèm `Retry-After` và `retryAfterMs`. Dùng Redis nếu có `REDIS_URL`, nếu không thì bộ nhớ trong tiến trình. **Bị cấm chat** (`mutedUntil` còn hiệu lực) → từ chối ở `ChatMuteGuard`; giảng viên không bao giờ bị cấm.

## Kiểm duyệt

Người kiểm duyệt của một khóa là giảng viên của khóa đó và admin nền tảng.

- **Báo cáo**: thành viên báo cáo tin họ thấy được (không tự báo cáo tin của mình: `CHAT_REPORT_OWN_MESSAGE`; mỗi người một lần: `409 CHAT_ALREADY_REPORTED`; tin đã ẩn: 404). Báo cáo đầu tiên chuyển tin `ACTIVE → FLAGGED` (vẫn hiển thị) và đưa vào hàng chờ.
- **Ẩn**: tin → `HIDDEN`, các báo cáo `PENDING` thành `RESOLVED`, phát `message_hidden` để mọi client bỏ nội dung ngay.
- **Bác bỏ**: báo cáo → `RESOLVED`, tin `FLAGGED` → `ACTIVE`.
- **Cấm chat**: bản ghi `chat_mutes` duy nhất theo `(course_id, user_id)`; cấm lại thay thời hạn. Không cấm được giảng viên của khóa hay chính mình (`CHAT_MUTE_TARGET_FORBIDDEN`). Phát `user_muted`.
- Mọi lần ẩn/bác bỏ/cấm ghi `chat_moderation_logs` (chỉ-ghi-thêm) **trong cùng transaction** với tác dụng của nó.

Giao diện kiểm duyệt: `/instructor/chat-moderation` (`ModerationQueue`, `ModerationDialogs`).

## Dữ liệu

`chat_messages` (khóa học, người gửi, nội dung, `status` `ACTIVE|FLAGGED|HIDDEN`; index `(course_id, created_at, id)`), `chat_reports`, `chat_mutes`, `chat_moderation_logs`. Các bảng `chat_rooms`, `chat_members`, `messages` thời kỳ đầu đã bị xóa ở migration `202610230002_drop_legacy_chat`.

## Giao diện

Trang `/learn/[courseSlug]/chat` (`CourseChatPage` → `CourseChatRoom`): danh sách tin (`ChatMessageList`, `ChatMessageItem`), ô soạn (`ChatComposer`) và hộp thoại báo cáo/kiểm duyệt. Có cache tin phía client (`chat-cache`) để mở lại phòng không trống.

## Kiểm thử

Unit: rate limit guard, Pusher provider, mô hình/định dạng chat, cache. Web: `course-chat-room`, `moderation-queue`, `use-chat-messages`, `use-course-channel`. Xem [testing](testing.md).

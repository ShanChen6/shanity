# Lớp học trực tiếp

Giảng viên đặt lịch các buổi học trực tiếp cho khóa; học viên đã ghi danh xem lịch và vào xem luồng **nhúng** (YouTube, Vimeo, Jitsi hoặc một host được cho phép) ngay trong trang web. Nền tảng không tự phát video mà chỉ nhúng và đo thời gian xem để điểm danh.

## Ai làm được gì

Quyền xác định bằng `roleIn(principal, courseId)`: `admin` (cho mọi khóa), hoặc tư cách thành viên phòng của khóa (giống [chat](chat.md#ai-là-thành-viên-phòng): giảng viên của khóa, hay học viên có ghi danh còn hiệu lực trong khóa đã xuất bản). Người ngoài khóa bị từ chối (`LIVE_SESSION_FORBIDDEN`).

| Việc | Giảng viên của khóa / admin | Học viên |
| --- | --- | --- |
| Tạo buổi, hủy/kết thúc sớm | Có | Không |
| Xem danh sách, chi tiết, lịch | Có | Có |
| Thấy URL nhúng | Luôn | Chỉ khi buổi đang diễn ra, hoặc đã kết thúc với nhà cung cấp có bản ghi lại (YouTube, Vimeo) |
| Xem báo cáo điểm danh cả lớp | Có | Không (chỉ xem điểm danh của mình) |

URL nhúng của học viên **không có trong phản hồi** cho tới khi buổi bắt đầu, nên không lộ qua trang hay network log.

## Buổi học

Bảng `live_sessions`: `course_id`, `instructor_id`, `title` (≤ 200), `description` (≤ 5000), `start_time`, `end_time`, `embed_url`, `provider`, `status`.

- Thời điểm là ISO 8601 có múi giờ; `start_time` phải ở tương lai, `end_time` sau `start_time` và buổi dài tối đa **12 giờ**.
- `embedUrl` là link bất kỳ giảng viên dán vào (trang xem YouTube, link `youtu.be`, trang Vimeo, phòng Jitsi…); API **chuẩn hóa** thành URL có thể đặt trong `<iframe>` hoặc **từ chối** (`400 LIVE_EMBED_URL_INVALID`) — trang học không bao giờ nhúng một site tùy ý. `provider` gửi kèm (nếu có) phải khớp (`LIVE_EMBED_PROVIDER_MISMATCH`). Bộ chuẩn hóa được giữ **giống hệt** ở `apps/api/src/modules/live/embed-url.ts` và `apps/web/src/features/live/embedUrlNormalizer.ts` (API lưu dạng chuẩn hóa, web chuẩn hóa lại trước khi render).
- Nhà cung cấp: `YOUTUBE`, `VIMEO`, `JITSI` (`meet.jit.si` và các host trong `LIVE_JITSI_HOSTS`), `CUSTOM_EMBED` (chỉ https, chỉ host trong `LIVE_EMBED_ALLOWED_HOSTS`). Đặt **cùng danh sách** ở phía web bằng `NEXT_PUBLIC_LIVE_JITSI_HOSTS` và `NEXT_PUBLIC_LIVE_EMBED_ALLOWED_HOSTS`.
- **Trạng thái**: chỉ `SCHEDULED`, `CANCELLED` và `ENDED` (kết thúc sớm) được lưu; `LIVE`/`ENDED` còn lại được **suy ra từ đồng hồ** theo cửa sổ `[start_time, end_time)`. Phản hồi luôn kèm `serverTime` để client đồng bộ đồng hồ. Giảng viên đổi trạng thái bằng `PATCH /api/v1/live-sessions/:id/status` với `CANCELLED` hoặc `ENDED`.

## API

| Endpoint | Mô tả |
| --- | --- |
| `POST /api/v1/courses/:courseId/live-sessions` | Tạo buổi |
| `GET /api/v1/courses/:courseId/live-sessions` | Các buổi của khóa, sớm nhất trước, kèm trạng thái hiệu lực |
| `GET /api/v1/live-sessions/my-schedule?startDate=&endDate=` | Lịch của tôi cho FullCalendar (khóa tôi học còn hiệu lực + khóa tôi dạy); khoảng tối đa 100 ngày; không kèm URL phát |
| `GET /api/v1/live-sessions/:id` | Chi tiết (trang người xem) |
| `PATCH /api/v1/live-sessions/:id/status` | Hủy / kết thúc sớm |
| `POST /api/v1/live-sessions/:id/heartbeat` | Điểm danh (xem dưới) |
| `GET /api/v1/live-sessions/:id/attendance/me` | Thời gian đã được ghi nhận của tôi |
| `GET /api/v1/courses/:courseId/live-sessions/:id/attendance-report` | Báo cáo điểm danh (giảng viên/admin) |

Tất cả `Cache-Control: no-store`, qua `OriginGuard` + `SessionGuard`.

## Điểm danh bằng heartbeat

Client gửi một **heartbeat mỗi 30 giây thời gian hiển thị** trong lúc buổi đang diễn ra. Server là bên duy nhất cộng thời gian:

- Mỗi ping hợp lệ đáng giá tối đa 30 giây và không bao giờ nhiều hơn khoảng thời gian từ ping hợp lệ trước (hoặc từ lúc bắt đầu), nên client nhanh hay nói dối đều không "mua" thêm thời gian được.
- Ping cách ping trước dưới 20 giây không được cộng gì (trả `200 { accepted: false }`).
- Việc cộng và kiểm tra khoảng cách là **một câu lệnh nguyên tử**: một loạt ping đồng thời chỉ cộng một nhịp. Có thêm `HeartbeatThrottleGuard` giới hạn tần suất gửi.
- Một học viên được coi là **đã tham dự** khi thời gian được cộng ≥ `ceil(độ dài buổi × ngưỡng%)`. Ngưỡng là `courses.live_attendance_threshold` (mặc định **50%**, CHECK trong khoảng hợp lệ). Hiện chưa có giao diện hay API sửa ngưỡng theo khóa; đổi trực tiếp trong database.
- Báo cáo liệt kê mọi học viên đang ghi danh (có mặt hay không) cùng người đã tham dự nhưng sau đó mất ghi danh.

Heartbeat chỉ nhận từ học viên đang học trong khóa; khi buổi không ở trạng thái `LIVE` trả `409 LIVE_SESSION_NOT_LIVE`.

## Giao diện

- Học viên: `/student/dashboard/schedule` (`ScheduleCalendar`) và `/student/courses/[slug]/live/[sessionId]` (`LiveSessionWorkspace`: `LivePlayer`, `AttendanceIndicator`, hook `useLiveClassHeartbeat` gửi nhịp theo thời gian hiển thị).
- Giảng viên: `/instructor/dashboard/schedule` (lịch) và cùng trang người xem, nơi `AttendanceReport` hiển thị báo cáo điểm danh. **Hiện chưa có form tạo/sửa buổi học trên web**: tạo buổi và hủy/kết thúc sớm đi qua API.

## Cấu hình

`LIVE_JITSI_HOSTS`, `LIVE_EMBED_ALLOWED_HOSTS`, `NEXT_PUBLIC_LIVE_JITSI_HOSTS`, `NEXT_PUBLIC_LIVE_EMBED_ALLOWED_HOSTS` (xem [configuration](configuration.md#chat-blog-và-lớp-trực-tiếp)).

## Kiểm thử

Unit: chuẩn hóa embed URL (`embed-url.spec.ts`, `embedUrlNormalizer.test.ts`), hook heartbeat, `live-workspace`, `live-time`, `schedule`. Xem [testing](testing.md).

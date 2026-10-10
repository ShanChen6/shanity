# Tiến độ học tập

Tiến độ gắn với từng cặp (học viên, bài học) và được tổng hợp lên khóa học. Mọi API tiến độ chỉ dành cho vai trò `student` có **ghi danh còn hiệu lực**, lọc theo tài khoản đang đăng nhập và đi qua `LessonAccessGuard` (nên cũng tuân theo khóa tuần tự). Mở hay chỉ tải nội dung một bài **không bao giờ** tự hoàn thành bài đó.

## Vòng đời của một bài

`NOT_STARTED → IN_PROGRESS → COMPLETED`, một chiều. `NOT_STARTED` được biểu diễn bằng *không có hàng* (tổng quan khóa học tự điền); enum lưu trữ `LessonProgressStatus` chỉ gồm `IN_PROGRESS` và `COMPLETED`. Lần mở đầu tiên tạo `IN_PROGRESS` với `started_at`. Hoàn thành là idempotent và `completed_at` đầu tiên không bao giờ bị ghi đè; trạng thái không lùi.

Bảng `lesson_progress`: duy nhất `(user_id, lesson_id)`; composite FK `(lesson_id, course_id)` chặn hàng trỏ sai khóa; các cột `started_at`, `last_accessed_at`, `completed_at`, `last_position`; chỉ mục theo `(user, course)`, `(user, lesson)` và `completed`. `enrollments` có thêm `last_accessed_lesson_id`/`last_accessed_at` để biết nơi học gần nhất.

## Bằng chứng hoàn thành

| Loại bài | Điều kiện hoàn thành | Vị trí lưu |
| --- | --- | --- |
| `TEXT` | Học viên bấm "Đánh dấu đã hoàn thành" với `scrollPercentage ≥ 80` (dưới 80 → 400) | — |
| `VIDEO` | `percentage ≥ 85` hoặc `ended: true` trong `video-progress` | Giây phát (số nguyên), giữ vị trí xa nhất bằng `GREATEST`; client đồng bộ tối đa mỗi 10 giây |
| `DOCUMENT` (cho tải) | Đã bấm tải xuống (`downloaded`), hoặc đã tới trang cuối (`reachedLastPage`) rồi hoàn thành | — |
| `DOCUMENT` (không cho tải) | Tới trang cuối rồi hoàn thành | — |

Dịch vụ kiểm tra chiến lược theo loại bài thật của server: yêu cầu hoàn thành chung không thể hoàn thành một video (400).

## Bài bắt buộc, quiz và hai con số tiến độ

`lessons.is_required` (mặc định `true`, giảng viên đổi được ở mọi đường tạo/sửa bài) quyết định bài có tính vào tiến độ hay không. Dịch vụ `CourseProgressCalculatorService` là cài đặt duy nhất và tính **hai con số tách biệt** từ `lesson_progress`, `quiz_attempts` cùng bài/quiz *hiện tại* của khóa (không lưu sẵn nên sửa giáo trình có hiệu lực ở lần đọc kế tiếp, không cần backfill):

```text
percentage  (thanh tiến độ) = min(100, floor((bài bắt buộc đã xong + bước quiz đã xong)
                                              / (bài bắt buộc + quiz gắn khóa) × 100))
isCompleted (cổng hoàn thành) = mọi bài bắt buộc đã xuất bản đã xong
                                VÀ mọi quiz bắt buộc gắn khóa đã xuất bản đã đạt
```

- Chỉ tính bài **đã xuất bản**. Bài tùy chọn có tiến độ riêng nhưng không nằm trong tử số lẫn mẫu số.
- "Quiz gắn khóa" là quiz đã xuất bản có scope `LESSON`, `CHAPTER` hoặc `COURSE` thuộc khóa; quiz `STANDALONE` không bao giờ tính.
- Bước quiz hoàn thành: quiz **bắt buộc** khi đã đạt, quiz **tùy chọn** khi đã nộp (đạt hay không). Lượt đạt là lượt đã chốt (`COMPLETED`, `SUBMITTED`, `TIMED_OUT`) có `is_passed`; `NEEDS_GRADING` không tham gia cho tới khi chấm xong. Vì vậy hoàn thành đã đạt là **đơn điệu**: lần làm sau không đạt không lấy lại.
- Quiz tùy chọn làm thanh nhích lên nhưng không chặn hoàn thành, nên có thể `isCompleted` khi `percentage < 100`; còn `percentage = 100` luôn kéo theo `isCompleted`. Dùng `floor` (199/200 là 99%) để 100% nghĩa là mọi thứ được tính đã xong.
- Khóa không có mục nào cần làm trả `100%`.
- Một câu SQL chỉ đọc (một snapshot MVCC) nên các lần hoàn thành/heartbeat đồng thời không làm tổng sai; kết quả được cache theo học viên-khóa (`ProgressCache`) và vô hiệu hóa khi giáo trình đổi (`CurriculumEvents`) hoặc tiến độ học viên đổi.

## API (đều `student`)

Mọi route cũng phục vụ dưới `/api/v1/student/…`.

| Endpoint | Mô tả |
| --- | --- |
| `GET /student/enrolled-courses` | Khóa đã ghi danh kèm tiến độ |
| `GET /student/resume-course` | Khóa học gần nhất để "tiếp tục học": `{ hasActiveCourse, … }` |
| `GET /courses/:courseId/resume-lesson` | Bài để tiếp tục trong khóa: `lessonSlug`, `lessonTitle`, `lastPosition`, `hasStarted` |
| `GET /courses/:courseId/progress` | Số đếm, phần trăm chính xác và mọi bài đã xuất bản với trạng thái đã điền |
| `POST /lessons/:lessonId/progress/start` | Chuyển lần mở đầu tiên sang `IN_PROGRESS` |
| `PATCH /lessons/:lessonId/progress/heartbeat` | Upsert nguyên tử vị trí và `last_accessed_at`, không làm lùi bài đã hoàn thành |
| `POST /lessons/:lessonId/progress/complete` (hoặc `/lessons/:lessonId/complete`) | Hoàn thành bài văn bản/tài liệu kèm bằng chứng |
| `PATCH /lessons/:id/video-progress` | `{ seconds, percentage, ended? }` |

Mọi phản hồi ghi chứa cả `progress` lẫn `courseProgress` (tổng hợp ở trên). Các thao tác ghi an toàn khi gửi lại: trạng thái không lùi, vị trí video dùng `GREATEST`, thời điểm hoàn thành dùng `COALESCE`. Tiến độ "tiếp tục học" lưu trên server nên đổi thiết bị hay tải lại trang không mất vị trí.

## Báo cáo cho giảng viên

`GET /instructor/courses/:courseId/students-progress` và `GET /instructor/courses/:courseId/students/:studentId/progress` (vai trò `instructor|admin` kèm `CourseOwnerGuard`). Giao diện: `/instructor/courses/[id]/progress`.

## Quiz và khóa học tuần tự

Trong khóa **tuần tự**, một bài chưa được coi là xong nếu nó có quiz cấp bài (`scope = LESSON`) bắt buộc, đã xuất bản mà học viên chưa đạt — xem [courses-and-lessons](courses-and-lessons.md#quyền-truy-cập-bài-học) và [quiz](quiz.md).

## Giao diện

`components/learning`: `LearningShell`, `CurriculumSidebar`, `LessonActionBar`, `CourseCompletedDialog`, các renderer văn bản/video/tài liệu, đồng bộ vị trí video có điều tiết, và các trang `/my-learning`, `/my-courses`, `/dashboard`.

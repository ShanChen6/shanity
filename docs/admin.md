# Khu vực quản trị và giảng viên

Hai cổng giao diện riêng, mỗi cổng có layout, điều hướng và component riêng (cổng giảng viên không import trang hay feature của cổng admin). Phiên, theme và primitive UI được dùng chung. Mọi quyền thực sự do API cưỡng chế ([permissions](permissions.md)); giao diện chỉ định tuyến và hiển thị phản hồi 403 rõ ràng.

## Cổng quản trị (`/admin/*`)

Đăng nhập tại `/admin/login` ([authentication](authentication.md#phiên-và-bảo-vệ-route-ở-web)). Trang dưới `/admin` chỉ dành cho `admin`, ngoại trừ `/admin/orders` mở thêm cho `finance_officer`.

| Route | Chức năng |
| --- | --- |
| `/admin` | Tổng quan: năm số đếm (tổng, học sinh, giảng viên, admin, đang hoạt động) từ `GET /users/stats` |
| `/admin/users` | Danh sách người dùng: tìm theo tên/email (chuỗi con, không phân biệt hoa thường), lọc `role`, `status`, phân trang 20/trang (tối đa 100), trạng thái lưu trên URL; nút **Thêm người dùng** |
| `/admin/users/[id]` | Chi tiết, **Sửa thông tin** (tên + email), đổi vai trò, khóa/mở tài khoản |
| `/admin/orders` | Bảng điều khiển đơn hàng: lọc, chi tiết, đối soát thủ công, hoàn tiền ([payments](payments.md#quản-trị-đơn-hàng)) |
| `/admin/blog`, `/admin/blog/new`, `/admin/blog/[id]/edit` | Quản lý và duyệt bài blog ([blog](blog.md)) |
| `/admin/comments` | Hàng chờ bình luận cần duyệt ([blog](blog.md#bình-luận)) |
| `/admin/settings` | Trạng thái dịch vụ và cấu hình thanh toán đang áp dụng (chỉ admin) |

### API quản lý người dùng

Tất cả yêu cầu phiên admin hiện hành (đọc từ database) và, với thao tác ghi, `Origin` hợp lệ.

| Endpoint | Mô tả |
| --- | --- |
| `GET /users` | `page`, `limit` (≤ 100), `search` (≤ 254), `role`, `status`. Lọc kết hợp bằng AND, người dùng nhiều vai trò không bị lặp |
| `GET /users/stats` | Năm số đếm; một câu SQL, `no-store` |
| `GET /users/:id` | Chỉ trả `id`, `email`, `displayName`, `status`, `roles`, `createdAt`, `updatedAt`; không bao giờ trả hash hay dữ liệu phiên |
| `POST /users` | Tạo `displayName`, `email`, `password` (12–128), `role` (`STUDENT`, `INSTRUCTOR`, `ADMIN` hoặc `FINANCE_OFFICER`) — người dùng và vai trò tạo nguyên tử, tài khoản mới `active`. Email trùng 409 |
| `PATCH /users/:id` | Chỉ `displayName` và `email`; không đổi được mật khẩu/vai trò/trạng thái |
| `PATCH /users/:id/role` | `{ "role": … }` — **thay thế toàn bộ vai trò** bằng đúng một vai trò; đặt lại cùng vai trò là no-op |
| `PATCH /users/:id/status` | `{ "status": "ACTIVE" \| "DISABLED" }` |

Quy tắc an toàn: thay đổi vai trò/trạng thái dùng chung một advisory lock theo giao dịch và kiểm tra lại quyền admin hoạt động của người thao tác sau khi giữ khóa. **Không tự hạ quyền hay tự khóa mình** (409); không thể khóa/hạ quyền admin cuối cùng; hai admin cùng hạ quyền nhau không thể cùng thành công. Không có xóa cứng: "xóa" tài khoản là khóa (giữ nguyên dữ liệu, chặn đăng nhập và phiên hiện có; có thể mở lại). Tham số sai → 400; không tồn tại → 404; UUID sai → 400. Thời gian hiển thị theo giờ Việt Nam.

### Trải nghiệm quản trị

Thông báo thành công là toast có thể đóng, không tự biến mất; lỗi nằm trong hộp thoại xác nhận. Hộp thoại xác nhận là `<dialog>` gốc, focus đầu tiên ở nút Hủy, Tab bị giữ trong hộp thoại, Escape đóng, focus trả về nút kích hoạt. Điều hướng di động là disclosure (không modal). Bảng cuộn ngang có vùng focus được; trạng thái rỗng phân biệt "chưa có dữ liệu", "không khớp bộ lọc" và "ngoài phạm vi trang".

## Cổng giảng viên (`/instructor/*`)

Yêu cầu vai trò `instructor` (admin cũng vào được). Quyền sở hữu khóa/chương/bài do API cưỡng chế.

| Route | Chức năng |
| --- | --- |
| `/instructor`, `/instructor/dashboard` | Tổng quan; `/instructor/dashboard/schedule` — lịch lớp trực tiếp (FullCalendar) |
| `/instructor/courses` | Khóa học của tôi: tìm kiếm, lọc trạng thái, 9 khóa/trang, nhãn trạng thái |
| `/instructor/courses/new` | Tạo khóa nháp (tiêu đề, slug tự sinh sửa được, danh mục) |
| `/instructor/courses/[id]/edit/basic` | Thông tin cơ bản, giá miễn phí/trả phí, thumbnail; lưu tường minh, cảnh báo thay đổi chưa lưu |
| `/instructor/courses/[id]/edit/curriculum` | Chương và bài: tạo/sửa/xóa, sắp xếp (kéo thả hoặc nút lên/xuống), tải video/tài liệu, nhập từ tệp |
| `/instructor/courses/[id]/preview` | Xem trước riêng tư, danh sách kiểm tra xuất bản; Xuất bản/Hủy xuất bản/Lưu trữ cần xác nhận |
| `/instructor/courses/[id]/progress` | Tiến độ học viên của khóa |
| `/instructor/courses/[id]/quizzes` | Quiz gắn với khóa |
| `/instructor/quizzes`, `/create`, `/[id]/edit` | Danh sách quiz, trình soạn quiz |
| `/instructor/grading`, `/grading/attempts/[attemptId]` | Hàng chờ chấm và không gian chấm tự luận |
| `/instructor/blog`, `/new`, `/[id]/edit` | Viết, nhập tài liệu và gửi duyệt bài blog |
| `/instructor/chat-moderation` | Hàng chờ báo cáo chat của các khóa mình dạy |

Mọi lưu/sắp xếp dùng TanStack Query với cập nhật lạc quan, khôi phục khi lỗi và vô hiệu hóa query liên quan. Chi tiết nghiệp vụ: [courses-and-lessons](courses-and-lessons.md), [quiz](quiz.md), [progress](progress.md), [live-classes](live-classes.md).

### Báo cáo tiến độ cho giảng viên

`GET /instructor/courses/:courseId/students-progress` và `GET /instructor/courses/:courseId/students/:studentId/progress` (bảo vệ bởi `SessionGuard` + `CourseOwnerGuard`, vai trò `instructor`/`admin`).

## Khu vực học viên (`(dashboard)`, `(learning)`)

`/dashboard`, `/my-courses`, `/my-learning`, `/profile`, `/quizzes`, `/quiz-attempts`, `/account/orders`, `/checkout/[orderCode]`, `/learn/[courseSlug]/…` (trang học, chat, quiz), `/student/dashboard/schedule` và `/student/courses/[slug]/live/[sessionId]`. Chi tiết ở các tài liệu chủ đề tương ứng.

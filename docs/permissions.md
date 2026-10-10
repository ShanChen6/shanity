# Vai trò và phân quyền

Quyền được kiểm tra ở API theo **vai trò hiện hành trong database** kết hợp với **quan hệ trên tài nguyên**. Mặc định từ chối hành động chưa được cấp. Web chỉ dùng thông tin này để ẩn/hiện giao diện.

## Vai trò

| Vai trò | Mã | Cấp bằng cách nào |
| --- | --- | --- |
| Học sinh | `student` | Tự đăng ký (email hoặc Google) — server luôn cấp, client không chọn được |
| Giảng viên | `instructor` | Admin gán |
| Quản trị viên | `admin` | Admin gán, hoặc `SUPER_ADMIN_*` khi seed lần đầu |
| Nhân viên tài chính | `finance_officer` | Admin gán. Chỉ dùng bảng điều khiển đơn hàng `/admin/orders` (xem, đối soát thủ công, hoàn tiền); không quản lý người dùng hay nội dung |

Một tài khoản có thể có nhiều vai trò (`user_roles`). Phụ huynh **chưa thuộc phạm vi**; chưa quyết định.

## Ma trận chức năng

| Chức năng | Học sinh | Giảng viên | Quản trị viên |
| --- | --- | --- | --- |
| Hồ sơ cá nhân | Xem, sửa của mình | Xem, sửa của mình | Xem, sửa của mình; quản lý mọi tài khoản |
| Khóa học | Xem khóa đã xuất bản; ghi danh/mua | Tạo, sửa, xuất bản khóa mình sở hữu hoặc được phân công | Quản lý mọi khóa |
| Bài học, tài liệu | Xem khi có quyền truy cập khóa (hoặc bài xem trước) | Tạo, sửa, sắp xếp trong khóa của mình | Quản lý mọi khóa |
| Tiến độ | Xem, cập nhật của mình | Xem tiến độ học viên của khóa mình dạy | Xem phục vụ hỗ trợ |
| Quiz | Làm bài, xem kết quả của mình | Soạn đề, chấm tự luận, công bố kết quả trong khóa mình dạy | Quản lý mọi quiz |
| Thanh toán | Tạo đơn, xem đơn của mình | — | Xem mọi đơn, đối soát, hoàn tiền (cùng `finance_officer`) |
| Blog | Đọc, bình luận | Viết bài, gửi duyệt | Duyệt, xuất bản, ẩn bài; kiểm duyệt bình luận |
| Chat khóa học | Nhắn tin trong khóa đã ghi danh | Nhắn tin, kiểm duyệt trong khóa mình dạy | Xử lý báo cáo/kiểm duyệt (không mặc nhiên là thành viên phòng) |
| Lớp trực tiếp | Xem lịch, tham gia buổi của khóa đã ghi danh | Tạo, hủy hoặc kết thúc sớm buổi học và xem báo cáo điểm danh của khóa mình dạy | Như giảng viên cho mọi khóa |

## Cưỡng chế ở API

Ba lớp, từ ngoài vào trong:

1. **Miền route** — `DomainAccessGuard` kiểm tra vai trò theo miền của `/api/v1/<miền>/*` (xem [architecture](architecture.md#bề-mặt-api)). Chỉ thu hẹp quyền.
2. **Vai trò của handler** — `SessionGuard` xác thực phiên và áp `@Roles(...)`; vai trò đọc từ database ở mỗi request, nên thu hồi quyền có hiệu lực ngay.
3. **Quan hệ trên tài nguyên** — các guard/service riêng:

| Quy tắc | Thực thi bởi |
| --- | --- |
| Giảng viên chỉ sửa khóa/chương/bài của khóa mình sở hữu hoặc dạy; admin vượt qua | `CourseOwnershipGuard`, `CourseOwnerGuard`, `LessonOwnershipGuard` |
| Học viên chỉ xem bài khi có ghi danh còn hiệu lực (`revoked_at IS NULL`) hoặc bài là xem trước | `CourseAccessService`, `LessonAccessGuard`, `CourseEnrollmentGuard` |
| Quiz: chỉ người quản lý khóa đích (hoặc chủ quiz độc lập, admin) sửa/chấm | `QuizAuthorizationGuard`, `QuizAuthoringService` |
| Bài làm, tiến độ, đơn hàng luôn lọc theo tài khoản gọi | service lọc theo `principal.id` |
| Phòng chat: giảng viên của khóa, hoặc học viên có ghi danh còn hiệu lực trong khóa **đã xuất bản**; luôn đọc từ database, không cache | `ChatAccessService` |
| Hành động quản trị người dùng không thể tự hạ quyền/tự khóa, và luôn còn ít nhất một admin hoạt động | `UsersController` / service (advisory lock) |

Quan hệ dữ liệu: `courses.owner_id` là chủ sở hữu hiện tại (`NULL` ở khóa cũ chưa gán — giảng viên không sửa được khóa chưa có chủ); `course_instructors` là phân công dạy, tách khỏi quyền sở hữu (`unique(course_id, user_id)`). "Quản lý khóa" (`managesCourseSql`) gồm chủ sở hữu và giảng viên được phân công.

Nguyên tắc chung:

- Không suy ra quyền tài nguyên chỉ từ role trong token (token không chứa role).
- Bằng chứng thanh toán chỉ đến từ webhook đã xác minh hoặc quy trình đối soát có kiểm toán — không từ trang chuyển hướng của trình duyệt.
- Quyền quản trị kiểm duyệt không phải quyền tham gia trò chuyện như học viên.
- Cơ sở dữ liệu **không** có RLS; FK chỉ bảo đảm người dùng tồn tại, không bảo đảm họ đang có vai trò giảng viên. Mọi đường ghi nghiệp vụ phải kiểm tra cả vai trò lẫn quan hệ trong transaction.

## Vòng đời trạng thái do quyền quyết định

- Khóa học: `draft ↔ published`, và `draft`/`published` → `archived` (trạng thái cuối). Giá trị `review` và `hidden` được schema chấp nhận nhưng chưa có luồng chuyển trạng thái nào dùng (xem [courses-and-lessons](courses-and-lessons.md)). Chuyển trạng thái được kiểm tra ở service; CHECK chỉ giới hạn tập giá trị.
- Bài blog: `DRAFT → PENDING_REVIEW → PUBLISHED ↔ HIDDEN`, `ARCHIVED`; chỉ admin xuất bản/từ chối/ẩn ([blog](blog.md)).

## Còn mở

- Phụ huynh/người thanh toán thay học sinh.
- Chính sách thu hồi quyền học khi hoàn tiền (hiện hoàn đủ sẽ thu hồi, hoàn một phần thì giữ quyền học — xem [payments](payments.md)).
- Quy trình chuyển chủ khóa và đồng giảng dạy chi tiết.
- Audit cho cấp/thu hồi vai trò và đổi chủ khóa (hiện đã có audit cho đơn hàng, chấm điểm và kiểm duyệt chat/bình luận).

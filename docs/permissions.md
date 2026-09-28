# Ma trận quyền Shanity

Ma trận được chủ dự án xác nhận. Đây là hợp đồng cho các API nghiệp vụ sắp triển khai; migration chỉ cung cấp quan hệ dữ liệu, chưa thực thi authorization.

| Chức năng | Học sinh | Giảng viên | Quản trị viên |
| --- | --- | --- | --- |
| Hồ sơ cá nhân | Xem, sửa của mình | Xem, sửa của mình | Xem và quản lý tài khoản |
| Khóa học | Xem khóa đã xuất bản; đăng ký/mua | Tạo, sửa khóa do mình sở hữu; gửi duyệt | Duyệt, xuất bản, ẩn và quản lý mọi khóa |
| Bài học, tài liệu | Xem khi có quyền truy cập khóa | Tạo, sửa trong khóa mình sở hữu | Quản lý mọi khóa |
| Tiến độ học | Xem, cập nhật của mình | Xem tiến độ học viên trong khóa mình dạy | Xem phục vụ quản trị, hỗ trợ |
| Quiz | Làm bài, xem kết quả của mình | Tạo đề, chấm tự luận trong khóa mình dạy | Quản lý và xử lý khiếu nại |
| Thanh toán | Tạo đơn, xem giao dịch của mình | Xem báo cáo doanh thu của khóa mình dạy, nếu có | Xem giao dịch; xử lý hoàn tiền theo quy trình |
| Blog | Đọc, bình luận | Đọc, viết bài và gửi duyệt | Duyệt, xuất bản, ẩn bài; kiểm duyệt bình luận |
| Chat | Nhắn tin trong khóa mình tham gia | Nhắn tin trong khóa mình dạy | Xử lý báo cáo, kiểm duyệt khi cần |

## Ánh xạ dữ liệu

- `roles`: student, instructor, admin; migration tạo danh mục, không cấp quyền cho tài khoản nào.
- `user_roles`: quan hệ nhiều–nhiều, không ép mỗi tài khoản chỉ có một vai trò. API đăng ký sau này cấp student ở server; client không được tự chọn instructor/admin.
- `courses.owner_id`: một chủ sở hữu hiện tại. `NULL` giữ tương thích khóa cũ/demo chưa có người phụ trách; không cho giảng viên sửa khóa chưa có owner. Gán chủ sở hữu có kiểm soát trước khi đưa khóa này vào luồng quản lý của giảng viên.
- `course_instructors`: giảng viên được phân công dạy, unique(course_id,user_id). Phân công dạy không tự cho phép sửa khóa/bài học. Owner và phân công là hai quan hệ riêng; đề xuất khi tạo khóa thì thêm owner vào danh sách dạy trong cùng transaction. Chi tiết đồng giảng dạy/chuyển chủ vẫn cần chốt.
- Khóa và bài blog hỗ trợ `review` và `hidden` bên cạnh draft/published/archived. Migration giữ nguyên mọi giá trị trạng thái hiện hữu; không tự ẩn hoặc đổi chủ khóa cũ. Ai được chuyển trạng thái phải được kiểm tra tại service; CHECK chỉ giới hạn tập giá trị.

## Quy tắc thực thi ở giai đoạn API

Kết hợp vai trò hiện hành với quan hệ tài nguyên; không chỉ kiểm tra role trong JWT. Mặc định từ chối hành động chưa được ma trận cấp. Hồ sơ của mình không bao gồm quyền tự đổi role. Giảng viên sửa khóa/bài cần owner_id trùng user hiện tại; xem tiến độ, quiz và chat cần phân công dạy. Học sinh xem nội dung cần enrollment còn hiệu lực và các điều kiện xuất bản sẽ chốt trong luồng học. Lọc theo tài khoản ở server đối với tiến độ, bài làm và giao dịch.

Chat kiểm tra quyền khóa và membership còn hiệu lực ở cả thao tác vào phòng, đọc lịch sử và gửi tin. Quyền quản trị kiểm duyệt không mặc nhiên là quyền tham gia trò chuyện như học viên. Doanh thu giảng viên là báo cáo theo khóa, không mở quyền xem mọi chi tiết giao dịch/người mua. Ghi audit cho cấp/thu hồi role, đổi owner, duyệt/ẩn nội dung, chấm lại và hoàn tiền khi triển khai các workflow này.

DB chưa có RLS, trigger kiểm tra role hay NestJS guard. FK chỉ đảm bảo user tồn tại, không bảo đảm user đang có role instructor. Các đường ghi nghiệp vụ phải kiểm tra cả role và quan hệ trong transaction; khi thu hồi quyền không được tiếp tục tin claim JWT cũ.

## Phần còn mở

Quy tắc quiz và hoàn tiền vẫn chưa được xác định bởi ma trận quyền. Chưa tạo bảng quiz, thanh toán, bình luận, báo cáo hoặc audit. Cần chốt bình luận phẳng/phân cấp, sửa/xóa, báo cáo và thời hạn lưu; quy trình duyệt và lịch sử thay đổi; phân công/chuyển chủ khóa; cách hợp nhất quyền khi tài khoản có nhiều vai trò. Ma trận này không tự cấp thêm quyền tác giả sửa/xóa blog hoặc bình luận ngoài các hành động đã nêu.

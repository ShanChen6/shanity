# Tài liệu Shanity

Tài liệu mô tả **hệ thống như hiện có trong mã nguồn**. Khi hành vi thay đổi, cập nhật tài liệu cùng PR. Tổng quan dự án và lệnh nhanh ở [README gốc](../README.md); hai ứng dụng có README riêng: [API](../apps/api/README.md), [Web](../apps/web/README.md).

## Bắt đầu

| Tài liệu | Nội dung |
| --- | --- |
| [getting-started](getting-started.md) | Cài đặt, chạy trên máy và bằng Docker Compose, tài khoản đăng nhập, xử lý sự cố |
| [configuration](configuration.md) | Mọi biến môi trường, giá trị mặc định và ràng buộc |
| [testing](testing.md) | Unit, e2e, migration, Playwright; quy tắc trước khi merge |
| [deployment](deployment.md) | Docker, danh sách kiểm tra production, nhiều instance, quan sát |

## Nền tảng

| Tài liệu | Nội dung |
| --- | --- |
| [architecture](architecture.md) | Kiến trúc backend/frontend, `/api/v1` và envelope, lỗi/log, cache, quy ước dữ liệu |
| [database](database.md) | Nhóm bảng, migration, TypeORM, bảo đảm ở tầng database, seed, sao lưu |
| [authentication](authentication.md) | Phiên cookie, Google OAuth, hồ sơ, đổi mật khẩu, avatar, bảo vệ route |
| [permissions](permissions.md) | Vai trò, ma trận quyền, cách cưỡng chế |
| [frontend](frontend.md) | Route, điều hướng, gọi API, design system, component |
| [admin](admin.md) | Cổng quản trị và cổng giảng viên |

## Tính năng

| Tài liệu | Nội dung |
| --- | --- |
| [courses-and-lessons](courses-and-lessons.md) | Khóa học, chương, bài, ghi danh, quyền truy cập, khóa tuần tự, lưu trữ media |
| [progress](progress.md) | Vòng đời tiến độ, bằng chứng hoàn thành, hai con số tiến độ, tiếp tục học |
| [quiz](quiz.md) | Scope, soạn và xuất bản, snapshot, làm bài, chấm tự luận, công bố, che điểm |
| [payments](payments.md) | Giá, đơn hàng, VietQR/Stripe, webhook, đối soát, hoàn tiền, kiểm toán |
| [chat](chat.md) | Chat theo khóa qua Pusher, rate limit, kiểm duyệt |
| [blog](blog.md) | Quy trình duyệt bài, nhập tài liệu, bình luận kiểm duyệt ba lớp |
| [live-classes](live-classes.md) | Lịch học nhúng, chuẩn hóa link, điểm danh heartbeat |
| [content-import](content-import.md) | Nhập bài học và quiz từ JSON/Markdown/Excel |

## Lộ trình đọc gợi ý

- **Người mới vào dự án**: README gốc → getting-started → architecture → permissions → tài liệu của tính năng bạn sẽ làm.
- **Sửa backend**: architecture → database → tài liệu tính năng → testing.
- **Sửa web**: frontend → authentication (phiên và route bảo vệ) → tài liệu tính năng.
- **Vận hành**: configuration → deployment → database (sao lưu) → payments (worker, đối soát).

## Phạm vi và trạng thái hiện tại

Đã triển khai: tài khoản và phân quyền, khóa học/bài học/tiến độ, quiz trắc nghiệm và tự luận, thanh toán VietQR và Stripe với đối soát/hoàn tiền, chat theo khóa, blog và bình luận kiểm duyệt, lớp học trực tiếp nhúng, nhập nội dung từ tệp, cổng quản trị và giảng viên.

Chưa có hoặc còn thiếu (được ghi chi tiết trong từng tài liệu):

- Xác minh email, quên/đặt lại mật khẩu, MFA, danh sách phiên ([authentication](authentication.md)).
- Phụ huynh/người thanh toán thay học sinh; mã giảm giá; doanh thu theo khóa cho giảng viên; dịch vụ gửi mail ([permissions](permissions.md), [payments](payments.md)).
- Object storage (adapter `s3` là bản dừng an toàn) và dọn tệp mồ côi ([courses-and-lessons](courses-and-lessons.md#lưu-trữ-media)).
- Form tạo/sửa buổi học trực tiếp trên web; giao diện đổi ngưỡng điểm danh ([live-classes](live-classes.md)).
- Văn bản pháp lý thật cho `/legal/*` ([configuration](configuration.md#footer-và-pháp-lý-web-đều-tùy-chọn)).

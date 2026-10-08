import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { LegalPage } from "@/features/legal/legal-page";

export const metadata: Metadata = {
  title: "Chính sách bảo mật · Shanity",
  description:
    "Shanity thu thập, sử dụng và bảo vệ dữ liệu của bạn như thế nào.",
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <LegalPage
        title="Chính sách bảo mật"
        intro="Trang này mô tả dữ liệu mà Shanity lưu và cách hệ thống sử dụng chúng, theo đúng cách hệ thống đang vận hành."
        sections={[
          {
            heading: "Dữ liệu chúng tôi lưu",
            body: (
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Tài khoản:</strong> email, tên hiển thị, ảnh đại diện
                  (nếu bạn tải lên). Mật khẩu chỉ được lưu dưới dạng băm một
                  chiều. Nếu bạn đăng nhập bằng Google, chúng tôi lưu mã định
                  danh tài khoản Google để liên kết hai bên.
                </li>
                <li>
                  <strong>Hoạt động học tập:</strong> tiến độ bài học, các lượt
                  làm bài kiểm tra, câu trả lời (kể cả tự luận và tệp đính kèm),
                  điểm số và nhận xét của giảng viên.
                </li>
                <li>
                  <strong>Giao dịch:</strong> đơn hàng, số tiền, phương thức
                  thanh toán và mã giao dịch của cổng thanh toán. Thông tin thẻ
                  do cổng thanh toán xử lý trực tiếp; Shanity không lưu số thẻ.
                </li>
                <li>
                  <strong>Dữ liệu kỹ thuật:</strong> địa chỉ IP được băm để giới
                  hạn số lần đăng nhập sai, và nhật ký lỗi máy chủ kèm mã tương
                  quan yêu cầu. Nhật ký không chứa mật khẩu hay nội dung truy
                  vấn cơ sở dữ liệu.
                </li>
              </ul>
            ),
          },
          {
            heading: "Mục đích sử dụng",
            body: (
              <p>
                Dữ liệu được dùng để cung cấp khóa học và bài kiểm tra, ghi nhận
                tiến độ, chấm điểm, xử lý thanh toán, bảo mật tài khoản và phát
                hiện lỗi vận hành. Chúng tôi không bán dữ liệu cá nhân.
              </p>
            ),
          },
          {
            heading: "Cookie và lưu trữ trên trình duyệt",
            body: (
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Cookie đăng nhập có thuộc tính <code>HttpOnly</code>: mã
                  JavaScript trên trang không đọc được chúng.
                </li>
                <li>
                  Trình duyệt lưu lựa chọn giao diện sáng/tối và bản nháp câu
                  trả lời tự luận để tránh mất bài khi mất kết nối.
                </li>
                <li>
                  Shanity không dùng cookie quảng cáo hay theo dõi bên thứ ba.
                </li>
              </ul>
            ),
          },
          {
            heading: "Bên thứ ba",
            body: (
              <p>
                Tùy cấu hình triển khai, dữ liệu cần thiết được chuyển tới:
                Google (khi bạn chọn đăng nhập bằng Google), các cổng thanh toán
                và dịch vụ tạo mã QR chuyển khoản, và dịch vụ lưu trữ tệp đính
                kèm bài làm. Mỗi bên chỉ nhận phần dữ liệu cần để thực hiện chức
                năng của họ.
              </p>
            ),
          },
          {
            heading: "Quyền của bạn",
            body: (
              <p>
                Bạn có thể xem và cập nhật tên hiển thị, ảnh đại diện và mật
                khẩu tại trang Hồ sơ. Để yêu cầu xuất hoặc xóa dữ liệu, hãy liên
                hệ quản trị viên của Shanity.
              </p>
            ),
          },
          {
            heading: "Thay đổi chính sách",
            body: (
              <p>
                Khi cách hệ thống xử lý dữ liệu thay đổi, trang này được cập
                nhật và ngày “Cập nhật lần cuối” thay đổi theo.
              </p>
            ),
          },
        ]}
      />
    </SiteShell>
  );
}

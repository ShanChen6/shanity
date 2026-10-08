import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { LegalPage } from "@/features/legal/legal-page";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng · Shanity",
  description: "Các điều khoản khi sử dụng nền tảng học tập Shanity.",
};

export default function TermsPage() {
  return (
    <SiteShell>
      <LegalPage
        title="Điều khoản sử dụng"
        intro="Khi tạo tài khoản hoặc sử dụng Shanity, bạn đồng ý với các điều khoản dưới đây."
        sections={[
          {
            heading: "Tài khoản",
            body: (
              <p>
                Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động diễn
                ra dưới tài khoản của mình, đồng thời cung cấp thông tin chính
                xác. Mỗi tài khoản dành cho một người dùng.
              </p>
            ),
          },
          {
            heading: "Sử dụng hợp lệ",
            body: (
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Không gian lận hoặc nhờ người khác làm bài kiểm tra thay bạn.
                </li>
                <li>
                  Không chia sẻ nội dung khóa học trả phí cho người chưa được
                  cấp quyền.
                </li>
                <li>
                  Không tải lên nội dung vi phạm pháp luật hoặc quyền của người
                  khác.
                </li>
                <li>
                  Không cố truy cập trái phép vào hệ thống hoặc dữ liệu của
                  người dùng khác.
                </li>
              </ul>
            ),
          },
          {
            heading: "Khóa học và thanh toán",
            body: (
              <p>
                Giá được hiển thị tại thời điểm bạn tạo đơn hàng. Đơn chưa thanh
                toán sẽ hết hạn sau một khoảng thời gian; quyền truy cập khóa
                học được cấp khi thanh toán được xác nhận. Yêu cầu hoàn tiền
                (nếu có) do quản trị viên xem xét và xử lý.
              </p>
            ),
          },
          {
            heading: "Nội dung và quyền sở hữu trí tuệ",
            body: (
              <p>
                Bài giảng, tài liệu và đề kiểm tra thuộc về giảng viên hoặc
                Shanity và chỉ được dùng cho việc học cá nhân của bạn. Nội dung
                bạn tạo ra (như bài làm) vẫn thuộc về bạn; bạn cho phép Shanity
                lưu và hiển thị nó cho giảng viên chấm điểm.
              </p>
            ),
          },
          {
            heading: "Tạm khóa tài khoản",
            body: (
              <p>
                Shanity có thể tạm khóa hoặc chấm dứt tài khoản vi phạm các điều
                khoản này. Khi đó bạn có thể liên hệ quản trị viên để được xem
                xét lại.
              </p>
            ),
          },
          {
            heading: "Thay đổi dịch vụ và điều khoản",
            body: (
              <p>
                Tính năng và điều khoản có thể thay đổi. Việc tiếp tục sử dụng
                sau khi thay đổi có hiệu lực nghĩa là bạn chấp nhận phiên bản
                mới.
              </p>
            ),
          },
        ]}
      />
    </SiteShell>
  );
}

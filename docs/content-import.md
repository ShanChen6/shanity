# Nhập nội dung từ tệp (JSON, Markdown, Excel)

Giảng viên và admin tạo **bài học văn bản** hoặc **quiz** bằng cách tải một tệp lên. Mọi bản nhập đều là **bản nháp** (`lessons.is_published = false`, `quizzes.status = DRAFT`) để xem lại trước khi xuất bản. (Nhập tài liệu cho bài **blog** là tính năng khác: xem [blog](blog.md#nhập-từ-tài-liệu).)

## API

| Method | Route | Trường multipart | Loại tệp |
| --- | --- | --- | --- |
| POST | `/admin/import/lesson` | `file`, `chapterId` (bắt buộc), `title` (ghi đè tệp) | `.md`, `.json` |
| POST | `/admin/import/quiz` | `file`, tùy chọn `title`, `scope`, `targetId`, `slug`, `description` (ghi đè tệp) | `.json`, `.md`, `.xlsx` |

Cả hai giữ `OriginGuard`, `SessionGuard` và `@Roles('instructor', 'admin')`. Guard chạy trước khi multer đọc body nên quyền theo tài nguyên được kiểm tra trong `ContentImportService`: bài học dùng cùng quy tắc với `LessonOwnershipGuard` (admin hoặc giảng viên của khóa; chương không tồn tại cũng là 403); quiz đi qua `QuizAuthoringService.insertDraft`, cùng ràng buộc liên kết và `canManageCourse` như `POST /admin/quizzes`.

### Phản hồi

| Mã | Khi nào |
| --- | --- |
| 201 | Đã tạo. Với quiz, phản hồi là chi tiết soạn thảo kèm `import: { format, questionCount }` |
| 400 | Thiếu tệp hoặc trường multipart sai (ví dụ `chapterId` không phải UUID) |
| 403 | Sai `Origin`, vai trò hoặc quyền sở hữu (`TARGET_COURSE_FORBIDDEN` với quiz) |
| 413 | Tệp > **5 MB**, hoặc `.xlsx` giải nén vượt 50 MB / quá 1000 mục ZIP (`IMPORT_FILE_TOO_LARGE_UNCOMPRESSED`) |
| 415 | `UNSUPPORTED_IMPORT_FILE`: phần mở rộng, MIME khai báo và nội dung byte không khớp nhau |
| 422 | `IMPORT_VALIDATION_FAILED`: nội dung không hợp lệ, **không lưu gì** |

Một 422 liệt kê mọi lỗi tìm được (tối đa 100), mỗi lỗi kèm vị trí:

```json
{
  "statusCode": 422,
  "code": "IMPORT_VALIDATION_FAILED",
  "errors": [
    { "row": 5, "column": "D", "message": "Row 5, Column D: Missing correct answer index" },
    { "line": 12, "message": "Line 12: At least 2 options are required" },
    { "path": "questions[0].points", "message": "questions[0].points: points must not be less than 1" }
  ],
  "totalErrors": 3
}
```

### Kiểm tra loại tệp

| Phần mở rộng | MIME khai báo được chấp nhận | Kiểm tra byte |
| --- | --- | --- |
| `.json` | `application/json` | Văn bản UTF-8, không phải định dạng nhị phân đã biết |
| `.md`, `.markdown` | `text/markdown`, `text/x-markdown`, `text/plain` | Văn bản UTF-8, không phải định dạng nhị phân đã biết |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `file-type` phải nhận ra bảng tính OOXML |

**Chống zip-bomb cho `.xlsx`.** `.xlsx` là một kho ZIP và `exceljs` giải nén tất cả vào bộ nhớ. Trước khi `exceljs` chạy, `assertXlsxArchiveWithinLimits` đọc central directory và giải nén từng mục với **trần đầu ra cứng** (`maxOutputLength`), nên giới hạn tổng 50 MB đúng cả khi kho khai báo sai kích thước hoặc nhiều mục trỏ chung dữ liệu. Kho có hơn 1000 mục, mục ZIP64, mục mã hóa hoặc phương pháp nén khác stored/deflate bị từ chối.

## Định dạng quiz

Cả ba định dạng đi qua cùng một chuỗi kiểm tra: cài đặt qua `CreateQuizDto`, từng câu qua `CreateQuestionDto`, `sanitizeLessonHtml` cho nội dung/lựa chọn/giải thích, rồi cổng chất lượng khi xuất bản (`validateQuizStructure`: ít nhất một câu; ít nhất 2 lựa chọn; ít nhất một đáp án đúng; đúng một đáp án với `SINGLE_CHOICE`; ít nhất một đáp án sai với `MULTIPLE_CHOICE`; điểm > 0). Trong transaction chèn, `validateQuizStructureForPublish` kiểm tra lại các hàng đã lưu.

### Excel (`.xlsx`)

Đọc **bảng tính đầu tiên**. Hàng 1 là tiêu đề (bị bỏ qua), hàng trống cũng bỏ qua. Cài đặt quiz lấy từ các trường form (`title` và `scope` bắt buộc).

| Cột | Nội dung | Mặc định |
| --- | --- | --- |
| A | Nội dung câu hỏi (bắt buộc) | |
| B | `SINGLE_CHOICE` hoặc `MULTIPLE_CHOICE` | `SINGLE_CHOICE` |
| C | Điểm (số nguyên > 0) | 10 |
| D | Số thứ tự đáp án đúng: `2`, hoặc `1,3` với `MULTIPLE_CHOICE` | |
| E–H | Lựa chọn 1–4 (ít nhất 2) | |
| I | Giải thích (tùy chọn) | |

Số thứ tự lựa chọn tham chiếu theo cột: `3` luôn là cột G, kể cả khi cột F trống.

### JSON

```json
{
  "title": "JavaScript cơ bản",
  "scope": "STANDALONE",
  "slug": "javascript-co-ban",
  "passingScore": 70,
  "questions": [
    {
      "content": "Giá trị nào là falsy?",
      "type": "MULTIPLE_CHOICE",
      "points": 4,
      "explanation": "Xem MDN.",
      "options": [
        { "content": "0", "isCorrect": true },
        { "content": "[]" }
      ]
    }
  ]
}
```

Các khóa cấp cao nhất khác `questions` là cài đặt của `CreateQuizDto`. Khóa lạ hoặc khóa do server sở hữu (`status`, `createdBy`…) bị từ chối.

### Markdown

```markdown
---
title: JavaScript cơ bản
scope: STANDALONE
slug: javascript-co-ban
---
## `typeof null` trả về gì?
Type: SINGLE_CHOICE
Points: 5
- [x] "object"
- [ ] "null"
Explanation: Một đặc điểm lịch sử của ngôn ngữ.
```

Front matter chứa cài đặt (mỗi dòng `khóa: giá trị`; hỗ trợ boolean, số nguyên, chuỗi có nháy và danh sách `[a, b]`). Mỗi tiêu đề `##` bắt đầu một câu hỏi. Các dòng trước lựa chọn đầu tiên nối tiếp nội dung câu hỏi. Văn bản trước câu hỏi đầu tiên thành mô tả quiz.

Các định dạng nhập chỉ mô tả câu trắc nghiệm (`SINGLE_CHOICE`, `MULTIPLE_CHOICE`); thêm câu tự luận trong trình soạn quiz ([quiz](quiz.md)).

## Định dạng bài học

- **Markdown**: front matter tùy chọn (`title`, `isPreview`, `isRequired`) rồi phần thân. Không có `title` trong front matter thì dùng tiêu đề `#` đầu tiên và bỏ nó khỏi thân.
- **JSON**: `{ "title", "textBody" }` (HTML) hoặc `{ "title", "markdown" }`, kèm `isPreview` và `isRequired` tùy chọn.

Markdown được render bằng `marked` (cho phép HTML thô đi qua), sau đó HTML được làm sạch bằng `sanitizeLessonHtml` trước khi kiểm tra và lưu: loại bỏ script, event handler, URL `javascript:` và iframe. Không còn gì an toàn thì bản nhập thất bại với 422.

## Giao diện web

| Nơi | Lối vào | Sau khi nhập thành công |
| --- | --- | --- |
| Giảng viên → Khóa → Chương trình học, trong mỗi chương | "Import từ file" cạnh "+ Add Lesson" (`ImportLessonDialog`) | Bài xuất hiện trong chương ở trạng thái chưa xuất bản kèm nhắc xem lại và xuất bản |
| Giảng viên → Quiz | "Import từ file" cạnh "Tạo quiz" (`ImportQuizDialog`) | Chuyển tới trình soạn quiz của bản DRAFT mới |

Component ở `apps/web/src/features/content-import/`:

- `FileDropzone`: bấm hoặc kéo-thả; kiểm tra phần mở rộng và giới hạn 5 MB trước khi tải.
- `ImportIssueList`: hiển thị 422 dạng "Dòng 5 · Cột D | Missing correct answer index" và cuộn tới khu vực lỗi.
- `api.ts`: gói lại tệp với MIME chuẩn của phần mở rộng (trình duyệt thường gửi MIME rỗng hoặc `text/plain` cho `.md`; server vẫn kiểm tra byte).
- `TemplateLinks`: liên kết tải mẫu.

Với `.xlsx`, hộp thoại quiz yêu cầu nhập tiêu đề và vị trí đặt (dùng lại `TargetSelector`) vì bảng tính chỉ chứa câu hỏi. Với JSON/Markdown, dùng cài đặt trong tệp trừ khi chọn "Ghi đè cài đặt trong file". Quiz `STANDALONE` không có slug sẽ được sinh slug từ tiêu đề.

Tệp mẫu tải về nằm ở `apps/web/public/templates/` (`lesson-import-sample.{md,json}`, `quiz-import-sample.{md,json}`, `quiz-import-template.xlsx`). Bộ test API nhập thử từng mẫu nên chúng không thể lệch khỏi parser.

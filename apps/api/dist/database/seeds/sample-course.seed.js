import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const SAMPLE_COURSE_SLUG = 'javascript-co-ban-cho-nguoi-moi';
export const SAMPLE_INSTRUCTOR_EMAIL = 'javascript.instructor@shanity.local';
const IDS = {
    instructor: '17000000-0000-4000-8000-000000000001',
    course: '17000000-0000-4000-8000-000000000002',
    chapters: [
        '17000000-0000-4000-8000-000000000011',
        '17000000-0000-4000-8000-000000000012',
        '17000000-0000-4000-8000-000000000013',
    ],
    lessons: [
        '17000000-0000-4000-8000-000000000021',
        '17000000-0000-4000-8000-000000000022',
        '17000000-0000-4000-8000-000000000023',
        '17000000-0000-4000-8000-000000000024',
        '17000000-0000-4000-8000-000000000025',
        '17000000-0000-4000-8000-000000000026',
        '17000000-0000-4000-8000-000000000027',
        '17000000-0000-4000-8000-000000000028',
        '17000000-0000-4000-8000-000000000029',
    ],
};
export const SAMPLE_CHAPTERS = [
    {
        id: IDS.chapters[0],
        title: 'Bắt đầu',
        description: 'JavaScript là gì, chuẩn bị công cụ và tài liệu cài đặt.',
        position: 1,
    },
    {
        id: IDS.chapters[1],
        title: 'Biến và Kiểu dữ liệu',
        description: 'Khai báo biến và làm chủ các kiểu dữ liệu nền tảng.',
        position: 2,
    },
    {
        id: IDS.chapters[2],
        title: 'Hàm trong JavaScript',
        description: 'Tổ chức chương trình bằng function và arrow function.',
        position: 3,
    },
];
export const SAMPLE_LESSONS = [
    {
        id: IDS.lessons[0], chapterIndex: 0, position: 1, type: 'TEXT',
        title: 'JavaScript là gì?', slug: 'javascript-la-gi', isPreview: true,
        textBody: `<h1>JavaScript là gì?</h1>
<p><strong>JavaScript</strong> là ngôn ngữ lập trình giúp trang web phản hồi hành động của người dùng. JavaScript chạy trên trình duyệt và cũng có thể chạy phía máy chủ với Node.js.</p>
<h2>Bạn sẽ dùng JavaScript để làm gì?</h2>
<ul><li>Cập nhật giao diện mà không tải lại cả trang.</li><li>Kiểm tra dữ liệu biểu mẫu trước khi gửi.</li><li>Gọi API và hiển thị dữ liệu bất đồng bộ.</li><li>Xây dựng ứng dụng web, máy chủ và công cụ dòng lệnh.</li></ul>
<h2>Chương trình đầu tiên</h2>
<pre><code>const learner = 'Shanity';
console.log(&#39;Xin chào, &#39; + learner + &#39;!&#39;);</code></pre>
<blockquote>Hãy mở DevTools, chọn tab Console và tự chạy ví dụ trên.</blockquote>
<p>JavaScript phân biệt chữ hoa và chữ thường: <code>studentName</code> và <code>studentname</code> là hai định danh khác nhau.</p>`,
    },
    {
        id: IDS.lessons[1], chapterIndex: 0, position: 2, type: 'VIDEO',
        title: 'Thiết lập môi trường học tập', slug: 'setup-moi-truong',
        externalUrl: 'https://www.youtube.com/watch?v=PkZNo7MFNFg', durationSeconds: 210,
    },
    {
        id: IDS.lessons[2], chapterIndex: 0, position: 3, type: 'DOCUMENT',
        title: 'Tài liệu cài đặt công cụ', slug: 'tai-lieu-cai-dat',
        document: {
            fileName: 'huong-dan-cai-dat-cong-cu-javascript.pdf',
            lines: ['HUONG DAN CAI DAT CONG CU JAVASCRIPT', '', '1. Cai Node.js ban LTS tu nodejs.org.', '2. Cai Visual Studio Code tu code.visualstudio.com.', '3. Mo terminal va chay: node --version', '4. Tao file hello.js voi console.log("Xin chao JavaScript");', '5. Chay chuong trinh: node hello.js', '', 'Meo: dung DevTools Console de thu nhanh cac bieu thuc JavaScript.'],
        },
    },
    {
        id: IDS.lessons[3], chapterIndex: 1, position: 1, type: 'VIDEO',
        title: 'let, const và var', slug: 'let-const-va-var',
        externalUrl: 'https://www.youtube.com/watch?v=PkZNo7MFNFg&t=1524s', durationSeconds: 515,
    },
    {
        id: IDS.lessons[4], chapterIndex: 1, position: 2, type: 'TEXT',
        title: 'Kiểu dữ liệu trong JavaScript', slug: 'kieu-du-lieu',
        textBody: `<h1>Kiểu dữ liệu trong JavaScript</h1>
<p>Mỗi giá trị có một kiểu. Các kiểu nguyên thủy thường gặp là <strong>string</strong>, <strong>number</strong>, <strong>boolean</strong>, <strong>undefined</strong>, <strong>null</strong>, <strong>bigint</strong> và <strong>symbol</strong>.</p>
<pre><code>const course = 'JavaScript cơ bản';
const lessonCount = 9;
const published = true;
let nextLesson;
const selectedLesson = null;</code></pre>
<h2>Kiểm tra kiểu</h2><p>Dùng toán tử <code>typeof</code> khi cần quan sát kiểu dữ liệu.</p>
<pre><code>typeof course;      // 'string'
typeof lessonCount; // 'number'
typeof published;   // 'boolean'</code></pre>
<p><code>null</code> biểu diễn chủ ý “chưa có giá trị”, còn <code>undefined</code> thường cho biết giá trị chưa được gán. Với object và array, hãy nhớ biến giữ một tham chiếu tới dữ liệu.</p>`,
    },
    {
        id: IDS.lessons[5], chapterIndex: 1, position: 3, type: 'DOCUMENT',
        title: 'Cheat Sheet: Biến và kiểu dữ liệu', slug: 'cheat-sheet-variables',
        document: {
            fileName: 'cheat-sheet-bien-va-kieu-du-lieu.pdf',
            lines: ['JAVASCRIPT CHEAT SHEET - BIEN VA KIEU DU LIEU', '', 'const: khong gan lai bien; uu tien su dung mac dinh.', 'let: cho phep gan lai; co block scope.', 'var: function scope; tranh dung trong code moi.', '', 'Primitive: string, number, boolean, undefined, null, bigint, symbol.', 'Reference: object, array, function.', '', 'Kiem tra: typeof value', 'So sanh nghiem ngat: value === expected', 'Chuyen so an toan: Number(value), Number.isNaN(value)'],
        },
    },
    {
        id: IDS.lessons[6], chapterIndex: 2, position: 1, type: 'VIDEO',
        title: 'Function cơ bản', slug: 'function-co-ban',
        externalUrl: 'https://www.youtube.com/watch?v=PkZNo7MFNFg&t=5220s', durationSeconds: 720,
    },
    {
        id: IDS.lessons[7], chapterIndex: 2, position: 2, type: 'TEXT',
        title: 'Arrow Function', slug: 'arrow-function',
        textBody: `<h1>Arrow Function</h1>
<p>Arrow function là cú pháp gọn để tạo hàm. Với một biểu thức duy nhất, giá trị được trả về ngầm định.</p>
<pre><code>const double = number =&gt; number * 2;
const greet = name =&gt; &#39;Xin chào, &#39; + name;

const total = (price, quantity) =&gt; {
  const subtotal = price * quantity;
  return subtotal;
};</code></pre>
<h2>Khi nào không nên dùng?</h2>
<p>Arrow function không có <code>this</code> riêng. Vì vậy, không nên dùng nó làm method khi method cần truy cập object thông qua <code>this</code>.</p>
<pre><code>const learner = {
  name: 'An',
  introduce() { return 'Mình là ' + this.name; }
};</code></pre>
<blockquote>Chọn cú pháp giúp ý định của hàm rõ ràng, thay vì luôn chọn phiên bản ngắn nhất.</blockquote>`,
    },
    {
        id: IDS.lessons[8], chapterIndex: 2, position: 3, type: 'DOCUMENT',
        title: 'Bài tập thực hành: Hàm', slug: 'practice-guide',
        document: {
            fileName: 'bai-tap-thuc-hanh-ham-javascript.pdf',
            lines: ['BAI TAP THUC HANH - HAM JAVASCRIPT', '', '1. Viet ham sum(a, b) tra ve tong hai so.', '2. Viet arrow function isEven(n) kiem tra so chan.', '3. Viet ham calculateTotal(items) tinh tong gia tri gio hang.', '4. Viet ham greet(name = "ban") co tham so mac dinh.', '5. Refactor mot doan code lap lai thanh ham tai su dung.', '', 'Tu kiem tra:', '- Ham co ten va trach nhiem ro rang?', '- Dau vao co duoc kiem tra?', '- Moi nhanh logic co gia tri tra ve hop ly?', '- Da thu voi du lieu bien va truong hop rong?'],
        },
    },
];
function escapePdfText(value) {
    return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}
export function buildSeedPdf(lines) {
    const commands = ['BT', '/F1 12 Tf', '50 790 Td'];
    for (const [index, line] of lines.entries()) {
        if (index > 0)
            commands.push('0 -22 Td');
        commands.push(`(${escapePdfText(line)}) Tj`);
    }
    commands.push('ET');
    const stream = commands.join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let output = '%PDF-1.4\n';
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(Buffer.byteLength(output));
        output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(output);
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(output, 'ascii');
}
async function ensureInstructor(manager) {
    const existing = (await manager.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [SAMPLE_INSTRUCTOR_EMAIL]));
    const instructorId = existing[0]?.id ?? IDS.instructor;
    if (existing.length === 0) {
        await manager.query(`INSERT INTO users(id, email, display_name, status)
       VALUES ($1, $2, $3, 'active')`, [instructorId, SAMPLE_INSTRUCTOR_EMAIL, 'Giảng viên JavaScript Shanity']);
    }
    await manager.query(`INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'instructor')
     ON CONFLICT (user_id, role_code) DO NOTHING`, [instructorId]);
    return instructorId;
}
async function ensureCourse(manager, instructorId) {
    const existing = (await manager.query('SELECT id FROM courses WHERE slug = $1 LIMIT 1', [SAMPLE_COURSE_SLUG]));
    const courseId = existing[0]?.id ?? IDS.course;
    if (existing.length === 0) {
        await manager.query(`INSERT INTO courses(id, slug, title, description, status) VALUES ($1, $2, $3, '', 'draft')`, [courseId, SAMPLE_COURSE_SLUG, 'JavaScript Cơ bản cho người mới']);
    }
    await manager.query(`UPDATE courses SET title = $2, description = $3, short_description = $4,
       category = 'Programming', level = 'Beginner', language = 'vi', price = 0,
       status = 'published', instructor_id = $5, owner_id = $5,
       published_at = COALESCE(published_at, now()), updated_at = now()
     WHERE id = $1`, [courseId, 'JavaScript Cơ bản cho người mới',
        'Khóa học nhập môn JavaScript bằng tiếng Việt: từ môi trường học tập, biến và kiểu dữ liệu đến cách xây dựng hàm rõ ràng, dễ tái sử dụng.',
        'Nắm vững nền tảng JavaScript qua 9 bài học thực tế bằng tiếng Việt.', instructorId]);
    await manager.query('DELETE FROM course_instructors WHERE course_id = $1', [courseId]);
    await manager.query('INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)', [courseId, instructorId]);
    return courseId;
}
async function writeDocuments(courseId) {
    const root = resolve(process.env.LESSON_MEDIA_STORAGE_DIR ?? 'uploads/lessons');
    const files = new Map();
    for (const lesson of SAMPLE_LESSONS) {
        if (!lesson.document)
            continue;
        const key = `documents/${courseId}/${lesson.id}/${lesson.document.fileName}`;
        const data = buildSeedPdf(lesson.document.lines);
        const absolutePath = resolve(root, key);
        await mkdir(resolve(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, data);
        files.set(lesson.id, { key, size: data.byteLength });
    }
    return files;
}
export async function seedSampleCourse(db) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('The sample course seed is disabled in production');
    }
    if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
        throw new Error('The sample course seed requires STORAGE_DRIVER=local');
    }
    let courseId = IDS.course;
    await db.transaction(async (manager) => {
        const instructorId = await ensureInstructor(manager);
        courseId = await ensureCourse(manager, instructorId);
        const documents = await writeDocuments(courseId);
        await manager.query('DELETE FROM lesson_progress WHERE course_id = $1', [courseId]);
        await manager.query('DELETE FROM lessons WHERE course_id = $1', [courseId]);
        await manager.query('DELETE FROM chapters WHERE course_id = $1', [courseId]);
        for (const chapter of SAMPLE_CHAPTERS) {
            await manager.query(`INSERT INTO chapters(id, course_id, title, description, position)
         VALUES ($1, $2, $3, $4, $5)`, [chapter.id, courseId, chapter.title, chapter.description, chapter.position]);
        }
        for (const lesson of SAMPLE_LESSONS) {
            const document = documents.get(lesson.id);
            await manager.query(`INSERT INTO lessons(
           id, course_id, chapter_id, title, slug, type, position, is_preview, is_published,
           text_body, video_external_url, video_provider, video_duration_seconds, video_status,
           document_asset_id, document_file_name, document_file_size, document_download_allowed,
           document_mime_type, document_file_type
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, true,
           $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )`, [lesson.id, courseId, SAMPLE_CHAPTERS[lesson.chapterIndex].id, lesson.title,
                lesson.slug, lesson.type, lesson.position, lesson.isPreview ?? false,
                lesson.textBody ?? null, lesson.externalUrl ?? null,
                lesson.type === 'VIDEO' ? 'YOUTUBE' : null,
                lesson.durationSeconds ?? null, lesson.type === 'VIDEO' ? 'READY' : null,
                document?.key ?? null, lesson.document?.fileName ?? null, document?.size ?? null,
                lesson.type === 'DOCUMENT' ? true : null,
                lesson.type === 'DOCUMENT' ? 'application/pdf' : null,
                lesson.type === 'DOCUMENT' ? 'PDF' : null]);
        }
        const rows = (await manager.query(`SELECT c.position AS chapter_position, l.position AS lesson_position, l.slug
       FROM chapters c JOIN lessons l ON l.chapter_id = c.id
       WHERE c.course_id = $1 ORDER BY c.position ASC, l.position ASC`, [courseId]));
        if (rows.length !== 9 || rows.some((row, index) => row.chapter_position !== Math.floor(index / 3) + 1 || row.lesson_position !== (index % 3) + 1)) {
            throw new Error('Sample course verification failed: expected exactly 3 ordered chapters x 3 lessons');
        }
    });
}
export const seed = seedSampleCourse;
//# sourceMappingURL=sample-course.seed.js.map
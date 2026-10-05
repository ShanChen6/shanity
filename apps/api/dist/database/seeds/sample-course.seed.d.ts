import type { DataSource } from 'typeorm';
export declare const SAMPLE_COURSE_SLUG = "javascript-co-ban-cho-nguoi-moi";
export declare const SAMPLE_INSTRUCTOR_EMAIL = "javascript.instructor@shanity.local";
type SeedLesson = {
    id: string;
    chapterIndex: number;
    position: number;
    title: string;
    slug: string;
    type: 'TEXT' | 'VIDEO' | 'DOCUMENT';
    isPreview?: boolean;
    textBody?: string;
    externalUrl?: string;
    durationSeconds?: number;
    document?: {
        fileName: string;
        lines: string[];
    };
};
export declare const SAMPLE_CHAPTERS: readonly [{
    readonly id: "17000000-0000-4000-8000-000000000011";
    readonly title: "Bắt đầu";
    readonly description: "JavaScript là gì, chuẩn bị công cụ và tài liệu cài đặt.";
    readonly position: 1;
}, {
    readonly id: "17000000-0000-4000-8000-000000000012";
    readonly title: "Biến và Kiểu dữ liệu";
    readonly description: "Khai báo biến và làm chủ các kiểu dữ liệu nền tảng.";
    readonly position: 2;
}, {
    readonly id: "17000000-0000-4000-8000-000000000013";
    readonly title: "Hàm trong JavaScript";
    readonly description: "Tổ chức chương trình bằng function và arrow function.";
    readonly position: 3;
}];
export declare const SAMPLE_LESSONS: readonly SeedLesson[];
export declare function buildSeedPdf(lines: readonly string[]): Buffer;
export declare function seedSampleCourse(db: DataSource): Promise<void>;
export declare const seed: typeof seedSampleCourse;
export {};

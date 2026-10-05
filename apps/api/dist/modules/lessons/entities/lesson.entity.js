var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, } from 'typeorm';
import { Chapter } from '../../../courses/chapter.entity.js';
export var LessonType;
(function (LessonType) {
    LessonType["TEXT"] = "TEXT";
    LessonType["VIDEO"] = "VIDEO";
    LessonType["DOCUMENT"] = "DOCUMENT";
})(LessonType || (LessonType = {}));
export var VideoProvider;
(function (VideoProvider) {
    VideoProvider["S3"] = "S3";
    VideoProvider["YOUTUBE"] = "YOUTUBE";
    VideoProvider["VIMEO"] = "VIMEO";
})(VideoProvider || (VideoProvider = {}));
export var MediaProcessingStatus;
(function (MediaProcessingStatus) {
    MediaProcessingStatus["PROCESSING"] = "PROCESSING";
    MediaProcessingStatus["READY"] = "READY";
})(MediaProcessingStatus || (MediaProcessingStatus = {}));
let Lesson = class Lesson {
    id;
    courseId;
    chapterId;
    chapter;
    title;
    slug;
    type;
    position;
    isPreview;
    isPublished;
    textBody;
    videoAssetId;
    videoExternalUrl;
    videoProvider;
    videoDurationSeconds;
    videoStatus;
    documentAssetId;
    documentFileName;
    documentFileSize;
    documentDownloadAllowed;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], Lesson.prototype, "id", void 0);
__decorate([
    Column({ name: 'course_id', type: 'uuid' }),
    __metadata("design:type", String)
], Lesson.prototype, "courseId", void 0);
__decorate([
    Column({ name: 'chapter_id', type: 'uuid' }),
    __metadata("design:type", String)
], Lesson.prototype, "chapterId", void 0);
__decorate([
    ManyToOne(() => Chapter, { nullable: false, onDelete: 'CASCADE' }),
    JoinColumn({
        name: 'chapter_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'lessons_chapter_fk',
    }),
    __metadata("design:type", Object)
], Lesson.prototype, "chapter", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Lesson.prototype, "title", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Lesson.prototype, "slug", void 0);
__decorate([
    Column({ type: 'enum', enum: LessonType, enumName: 'LessonType' }),
    __metadata("design:type", String)
], Lesson.prototype, "type", void 0);
__decorate([
    Column({ type: 'integer' }),
    __metadata("design:type", Number)
], Lesson.prototype, "position", void 0);
__decorate([
    Column({ name: 'is_preview', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Lesson.prototype, "isPreview", void 0);
__decorate([
    Column({ name: 'is_published', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Lesson.prototype, "isPublished", void 0);
__decorate([
    Column({ name: 'text_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "textBody", void 0);
__decorate([
    Column({ name: 'video_asset_id', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "videoAssetId", void 0);
__decorate([
    Column({ name: 'video_external_url', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "videoExternalUrl", void 0);
__decorate([
    Column({
        name: 'video_provider',
        type: 'enum',
        enum: VideoProvider,
        enumName: 'VideoProvider',
        nullable: true,
    }),
    __metadata("design:type", Object)
], Lesson.prototype, "videoProvider", void 0);
__decorate([
    Column({ name: 'video_duration_seconds', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "videoDurationSeconds", void 0);
__decorate([
    Column({
        name: 'video_status',
        type: 'enum',
        enum: MediaProcessingStatus,
        enumName: 'MediaProcessingStatus',
        nullable: true,
    }),
    __metadata("design:type", Object)
], Lesson.prototype, "videoStatus", void 0);
__decorate([
    Column({ name: 'document_asset_id', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "documentAssetId", void 0);
__decorate([
    Column({ name: 'document_file_name', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "documentFileName", void 0);
__decorate([
    Column({ name: 'document_file_size', type: 'bigint', nullable: true }),
    __metadata("design:type", Object)
], Lesson.prototype, "documentFileSize", void 0);
__decorate([
    Column({
        name: 'document_download_allowed',
        type: 'boolean',
        nullable: true,
    }),
    __metadata("design:type", Object)
], Lesson.prototype, "documentDownloadAllowed", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Lesson.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Lesson.prototype, "updatedAt", void 0);
Lesson = __decorate([
    Entity('lessons'),
    Unique('UQ_lessons_chapter_position', ['chapterId', 'position']),
    Unique('UQ_lessons_chapter_slug', ['chapterId', 'slug']),
    Index('lessons_chapter_idx', ['chapterId']),
    Index('lessons_chapter_position_idx', ['chapterId', 'position'])
], Lesson);
export { Lesson };
//# sourceMappingURL=lesson.entity.js.map
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Chapter } from '../../../courses/chapter.entity.js';

export enum LessonType {
  TEXT = 'TEXT',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum VideoProvider {
  S3 = 'S3',
  YOUTUBE = 'YOUTUBE',
  VIMEO = 'VIMEO',
}

export enum MediaProcessingStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
}

@Entity('lessons')
@Unique('UQ_lessons_chapter_position', ['chapterId', 'position'])
@Unique('UQ_lessons_chapter_slug', ['chapterId', 'slug'])
@Index('lessons_chapter_idx', ['chapterId'])
@Index('lessons_chapter_position_idx', ['chapterId', 'position'])
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Retained to preserve the existing lesson_progress composite integrity.
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'chapter_id', type: 'uuid' })
  chapterId: string;

  @ManyToOne(() => Chapter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'chapter_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'lessons_chapter_fk',
  })
  chapter: Relation<Chapter>;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'enum', enum: LessonType, enumName: 'LessonType' })
  type: LessonType;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'is_preview', type: 'boolean', default: false })
  isPreview: boolean;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished: boolean;

  @Column({ name: 'text_body', type: 'text', nullable: true })
  textBody: string | null;

  @Column({ name: 'video_asset_id', type: 'text', nullable: true })
  videoAssetId: string | null;

  @Column({ name: 'video_external_url', type: 'text', nullable: true })
  videoExternalUrl: string | null;

  @Column({
    name: 'video_provider',
    type: 'enum',
    enum: VideoProvider,
    enumName: 'VideoProvider',
    nullable: true,
  })
  videoProvider: VideoProvider | null;

  @Column({ name: 'video_duration_seconds', type: 'integer', nullable: true })
  videoDurationSeconds: number | null;

  @Column({
    name: 'video_status',
    type: 'enum',
    enum: MediaProcessingStatus,
    enumName: 'MediaProcessingStatus',
    nullable: true,
  })
  videoStatus: MediaProcessingStatus | null;

  @Column({ name: 'document_asset_id', type: 'text', nullable: true })
  documentAssetId: string | null;

  @Column({ name: 'document_file_name', type: 'text', nullable: true })
  documentFileName: string | null;

  @Column({ name: 'document_file_size', type: 'bigint', nullable: true })
  documentFileSize: string | null;

  @Column({
    name: 'document_download_allowed',
    type: 'boolean',
    nullable: true,
  })
  documentDownloadAllowed: boolean | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}

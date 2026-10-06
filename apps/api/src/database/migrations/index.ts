import { InstructorPortal1790899200005 } from './202610020005_instructor_portal.js';
import { LessonPreview1790899200006 } from './202610020006_lesson_preview.js';
import { LessonDomain1790899200007 } from './202610020007_lesson_domain.js';
import { Foundation1790467200001 } from './202609270001_foundation.js';
import { Community1790467200002 } from './202609270002_community.js';
import { AccessFoundation1790467200003 } from './202609270003_access_foundation.js';
import { Auth1790467200004 } from './202609270004_auth.js';
import { UserUpdateAt1790812800001 } from './202610010001_user_update_at.js';
import { UserAvatar1790899200001 } from './202610020001_user_avatar.js';
import { CourseSchema1790899200002 } from './202610020002_course_schema.js';
import { Chapters1790899200003 } from './202610020003_chapters.js';
import { Enrollments1790899200004 } from './202610020004_enrollments.js';
import { VideoLessonMetadata1791158400001 } from './202610050001_video_lesson_metadata.js';
import { VideoProviderConstraint1791158400002 } from './202610050002_video_provider_constraint.js';
import { VideoMetadataDiscriminator1791158400003 } from './202610050003_video_metadata_discriminator.js';
import { DocumentLessonMetadata1791158400004 } from './202610050004_document_lesson_metadata.js';
import { LessonProgress1791244800001 } from './202610060001_lesson_progress.js';
import { AddIsRequiredToLessons1791244800002 } from './202610060002_lesson_required.js';
import { ResumeLearning1791244800003 } from './202610060003_resume_learning.js';

export const migrationHistory = [
  {
    legacy: '202609270001_foundation.mjs',
    name: 'Foundation1790467200001',
    timestamp: 1790467200001,
    migration: Foundation1790467200001,
  },
  {
    legacy: '202609270002_community.mjs',
    name: 'Community1790467200002',
    timestamp: 1790467200002,
    migration: Community1790467200002,
  },
  {
    legacy: '202609270003_access_foundation.mjs',
    name: 'AccessFoundation1790467200003',
    timestamp: 1790467200003,
    migration: AccessFoundation1790467200003,
  },
  {
    legacy: '202609270004_auth.mjs',
    name: 'Auth1790467200004',
    timestamp: 1790467200004,
    migration: Auth1790467200004,
  },
  {
    legacy: '202610010001_user_update_at.mjs',
    name: 'UserUpdateAt1790812800001',
    timestamp: 1790812800001,
    migration: UserUpdateAt1790812800001,
  },
  {
    legacy: '202610020001_user_avatar.mjs',
    name: 'UserAvatar1790899200001',
    timestamp: 1790899200001,
    migration: UserAvatar1790899200001,
  },
  {
    legacy: '202610020002_course_schema.mjs',
    name: 'CourseSchema1790899200002',
    timestamp: 1790899200002,
    migration: CourseSchema1790899200002,
  },
  {
    legacy: null,
    name: 'Chapters1790899200003',
    timestamp: 1790899200003,
    migration: Chapters1790899200003,
  },
  {
    legacy: null,
    name: 'Enrollments1790899200004',
    timestamp: 1790899200004,
    migration: Enrollments1790899200004,
  },
  {
    legacy: null,
    name: 'InstructorPortal1790899200005',
    timestamp: 1790899200005,
    migration: InstructorPortal1790899200005,
  },
  {
    legacy: null,
    name: 'LessonPreview1790899200006',
    timestamp: 1790899200006,
    migration: LessonPreview1790899200006,
  },
  {
    legacy: null,
    name: 'LessonDomain1790899200007',
    timestamp: 1790899200007,
    migration: LessonDomain1790899200007,
  },
  {
    legacy: null,
    name: 'VideoLessonMetadata1791158400001',
    timestamp: 1791158400001,
    migration: VideoLessonMetadata1791158400001,
  },
  {
    legacy: null,
    name: 'VideoProviderConstraint1791158400002',
    timestamp: 1791158400002,
    migration: VideoProviderConstraint1791158400002,
  },
  {
    legacy: null,
    name: 'VideoMetadataDiscriminator1791158400003',
    timestamp: 1791158400003,
    migration: VideoMetadataDiscriminator1791158400003,
  },
  {
    legacy: null,
    name: 'DocumentLessonMetadata1791158400004',
    timestamp: 1791158400004,
    migration: DocumentLessonMetadata1791158400004,
  },
  {
    legacy: null,
    name: 'LessonProgress1791244800001',
    timestamp: 1791244800001,
    migration: LessonProgress1791244800001,
  },
  {
    legacy: null,
    name: 'AddIsRequiredToLessons1791244800002',
    timestamp: 1791244800002,
    migration: AddIsRequiredToLessons1791244800002,
  },
  {
    legacy: null,
    name: 'ResumeLearning1791244800003',
    timestamp: 1791244800003,
    migration: ResumeLearning1791244800003,
  },
];
export const migrations = migrationHistory.map((entry) => entry.migration);

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
import { SequentialCourses1791331200001 } from './202610070001_sequential_courses.js';
import { EnrollmentsCourseActiveIndex1791331200002 } from './202610070002_enrollments_course_active_idx.js';
import { QuizCoreSchema1791417600001 } from './202610080001_quiz_core_schema.js';
import { QuizTargetIntegrity1791417600002 } from './202610080002_quiz_target_integrity.js';
import { QuizQuestionsOptions1791417600003 } from './202610080003_quiz_questions_options.js';
import { QuizAttempts1791417600004 } from './202610080004_quiz_attempts.js';
import { QuizStandaloneNotRequired1791417600005 } from './202610080005_quiz_standalone_not_required.js';
import { QuizPublishedAt1791417600006 } from './202610080006_quiz_published_at.js';
import { QuizSubmissionGrading1791417600007 } from './202610080007_quiz_submission_grading.js';
import { QuizDiscoveryMetadata1791417600008 } from './202610080008_quiz_discovery_metadata.js';
import { VietQrPayments1791504000001 } from './202610090001_vietqr_payments.js';
import { CoursePricing1791590400001 } from './202610100001_course_pricing.js';
import { PaymentPersistence1791676800001 } from './202610110001_payment_persistence.js';
import { CheckoutProviders1791763200001 } from './202610120001_checkout_providers.js';
import { PaymentHardening1791849600001 } from './202610130001_payment_hardening.js';
import { WebhookLogs1791936000001 } from './202610140001_webhook_logs.js';
import { OrderAuditLogs1792022400001 } from './202610150001_order_audit_logs.js';
import { AddEssaySupportToQuestions1792108800001 } from './202610160001_add_essay_support_to_questions.js';
import { AddEssayAnswerAndGradingToAttemptAnswers1792195200001 } from './202610170001_add_essay_answer_and_grading_to_attempt_answers.js';
import { AddGradedStatusAndPublishedAt1792281600001 } from './202610180001_add_graded_status_and_published_at.js';
import { AddQuizGradeAuditLogs1792368000001 } from './202610190001_add_quiz_grade_audit_logs.js';

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
  {
    legacy: null,
    name: 'SequentialCourses1791331200001',
    timestamp: 1791331200001,
    migration: SequentialCourses1791331200001,
  },
  {
    legacy: null,
    name: 'EnrollmentsCourseActiveIndex1791331200002',
    timestamp: 1791331200002,
    migration: EnrollmentsCourseActiveIndex1791331200002,
  },
  {
    legacy: null,
    name: 'QuizCoreSchema1791417600001',
    timestamp: 1791417600001,
    migration: QuizCoreSchema1791417600001,
  },
  {
    legacy: null,
    name: 'QuizTargetIntegrity1791417600002',
    timestamp: 1791417600002,
    migration: QuizTargetIntegrity1791417600002,
  },
  {
    legacy: null,
    name: 'QuizQuestionsOptions1791417600003',
    timestamp: 1791417600003,
    migration: QuizQuestionsOptions1791417600003,
  },
  {
    legacy: null,
    name: 'QuizAttempts1791417600004',
    timestamp: 1791417600004,
    migration: QuizAttempts1791417600004,
  },
  {
    legacy: null,
    name: 'QuizStandaloneNotRequired1791417600005',
    timestamp: 1791417600005,
    migration: QuizStandaloneNotRequired1791417600005,
  },
  {
    legacy: null,
    name: 'QuizPublishedAt1791417600006',
    timestamp: 1791417600006,
    migration: QuizPublishedAt1791417600006,
  },
  {
    legacy: null,
    name: 'QuizSubmissionGrading1791417600007',
    timestamp: 1791417600007,
    migration: QuizSubmissionGrading1791417600007,
  },
  {
    legacy: null,
    name: 'QuizDiscoveryMetadata1791417600008',
    timestamp: 1791417600008,
    migration: QuizDiscoveryMetadata1791417600008,
  },
  {
    legacy: null,
    name: 'VietQrPayments1791504000001',
    timestamp: 1791504000001,
    migration: VietQrPayments1791504000001,
  },
  {
    legacy: null,
    name: 'CoursePricing1791590400001',
    timestamp: 1791590400001,
    migration: CoursePricing1791590400001,
  },
  {
    legacy: null,
    name: 'PaymentPersistence1791676800001',
    timestamp: 1791676800001,
    migration: PaymentPersistence1791676800001,
  },
  {
    legacy: null,
    name: 'CheckoutProviders1791763200001',
    timestamp: 1791763200001,
    migration: CheckoutProviders1791763200001,
  },
  {
    legacy: null,
    name: 'PaymentHardening1791849600001',
    timestamp: 1791849600001,
    migration: PaymentHardening1791849600001,
  },
  {
    legacy: null,
    name: 'WebhookLogs1791936000001',
    timestamp: 1791936000001,
    migration: WebhookLogs1791936000001,
  },
  {
    legacy: null,
    name: 'OrderAuditLogs1792022400001',
    timestamp: 1792022400001,
    migration: OrderAuditLogs1792022400001,
  },
  {
    legacy: null,
    name: 'AddEssaySupportToQuestions1792108800001',
    timestamp: 1792108800001,
    migration: AddEssaySupportToQuestions1792108800001,
  },
  {
    legacy: null,
    name: 'AddEssayAnswerAndGradingToAttemptAnswers1792195200001',
    timestamp: 1792195200001,
    migration: AddEssayAnswerAndGradingToAttemptAnswers1792195200001,
  },
  {
    legacy: null,
    name: 'AddGradedStatusAndPublishedAt1792281600001',
    timestamp: 1792281600001,
    migration: AddGradedStatusAndPublishedAt1792281600001,
  },
  {
    legacy: null,
    name: 'AddQuizGradeAuditLogs1792368000001',
    timestamp: 1792368000001,
    migration: AddQuizGradeAuditLogs1792368000001,
  },
];
export const migrations = migrationHistory.map((entry) => entry.migration);

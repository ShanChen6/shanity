import {
  InstructorContentController,
  CourseMediaController,
} from './instructor-content.controller.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard } from './course-ownership.guard.js';
import { CoursesController } from './courses.controller.js';
import { PublicCoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';
import { CourseAccessService } from './course-access.service.js';
import { LessonsModule } from '../modules/lessons/lessons.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  LocalVideoDeliveryController,
  VideoPlaybackController,
} from '../modules/lessons/video-playback.controller.js';
import { VideoPlaybackService } from '../modules/lessons/video-playback.service.js';
import { DocumentAccessController } from '../modules/lessons/document-access.controller.js';
import { DocumentAccessService } from '../modules/lessons/document-access.service.js';
import { LessonAccessController } from '../modules/lessons/lesson-access.controller.js';
import { LessonAccessGuard } from '../modules/lessons/guards/lesson-access.guard.js';
import { LessonAccessService } from '../modules/lessons/lesson-access.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, LessonsModule, StorageModule],
  controllers: [
    CoursesController,
    PublicCoursesController,
    InstructorContentController,
    CourseMediaController,
    VideoPlaybackController,
    LocalVideoDeliveryController,
    DocumentAccessController,
    LessonAccessController,
  ],
  providers: [
    CoursesService,
    CourseAccessService,
    CoursePublishabilityValidator,
    OriginGuard,
    SessionGuard,
    CourseOwnershipGuard,
    VideoPlaybackService,
    DocumentAccessService,
    LessonAccessService,
    LessonAccessGuard,
  ],
  exports: [CourseAccessService],
})
export class CoursesModule {}

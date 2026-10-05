var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { InstructorContentController, CourseMediaController, } from './instructor-content.controller.js';
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
import { LocalVideoDeliveryController, VideoPlaybackController, } from '../modules/lessons/video-playback.controller.js';
import { VideoPlaybackService } from '../modules/lessons/video-playback.service.js';
import { DocumentAccessController } from '../modules/lessons/document-access.controller.js';
import { DocumentAccessService } from '../modules/lessons/document-access.service.js';
import { LessonAccessController } from '../modules/lessons/lesson-access.controller.js';
import { LessonAccessGuard } from '../modules/lessons/guards/lesson-access.guard.js';
import { LessonAccessService } from '../modules/lessons/lesson-access.service.js';
let CoursesModule = class CoursesModule {
};
CoursesModule = __decorate([
    Module({
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
], CoursesModule);
export { CoursesModule };
//# sourceMappingURL=courses.module.js.map
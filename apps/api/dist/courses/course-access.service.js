var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.module.js';
let CourseAccessService = class CourseAccessService {
    database;
    constructor(database) {
        this.database = database;
    }
    async canAccessLesson(userId, lessonId) {
        const [lesson] = await this.database.dataSource.query(`SELECT lesson.is_preview AS "isPreview",
        EXISTS (
          SELECT 1
          FROM enrollments enrollment
          WHERE enrollment.user_id = $2
            AND enrollment.course_id = lesson.course_id
            AND enrollment.revoked_at IS NULL
        ) AS "isEnrolled"
      FROM lessons lesson
      WHERE lesson.id = $1`, [lessonId, userId ?? null]);
        if (!lesson)
            return { granted: false, reason: 'LESSON_NOT_FOUND' };
        if (lesson.isPreview)
            return { granted: true };
        if (!userId)
            return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
        if (!lesson.isEnrolled)
            return { granted: false, reason: 'ENROLLMENT_REQUIRED' };
        return { granted: true };
    }
};
CourseAccessService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], CourseAccessService);
export { CourseAccessService };
//# sourceMappingURL=course-access.service.js.map
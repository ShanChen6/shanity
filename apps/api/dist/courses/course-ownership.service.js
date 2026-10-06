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
import { DataSource } from 'typeorm';
export const managesCourseSql = (userParam) => `(${userParam} IN (course.owner_id, course.instructor_id)
    OR EXISTS (
      SELECT 1 FROM course_instructors assignment
      WHERE assignment.course_id = course.id
        AND assignment.user_id = ${userParam}
    ))`;
let CourseOwnershipService = class CourseOwnershipService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async canManageCourse(principal, courseId) {
        if (principal.roles.includes('admin'))
            return true;
        if (!courseId || !principal.roles.includes('instructor'))
            return false;
        const [row] = await this.dataSource.query(`SELECT EXISTS (
         SELECT 1 FROM courses course
         WHERE course.id = $1 AND ${managesCourseSql('$2')}
       ) AS allowed`, [courseId, principal.id]);
        return row?.allowed === true;
    }
};
CourseOwnershipService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource])
], CourseOwnershipService);
export { CourseOwnershipService };
//# sourceMappingURL=course-ownership.service.js.map
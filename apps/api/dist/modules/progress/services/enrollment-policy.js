var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
let EnrollmentPolicy = class EnrollmentPolicy {
    database;
    constructor(database) {
        this.database = database;
    }
    async requireActive(userId, courseId) {
        const [row] = await this.database.dataSource.query(`SELECT revoked_at IS NOT NULL AS revoked
       FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
        if (!row)
            throw new ForbiddenException({
                statusCode: 403,
                code: 'ENROLLMENT_REQUIRED',
                message: 'Active enrollment required',
            });
        if (row.revoked)
            throw new ForbiddenException({
                statusCode: 403,
                code: 'ENROLLMENT_SUSPENDED',
                message: 'Enrollment Suspended',
            });
    }
};
EnrollmentPolicy = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], EnrollmentPolicy);
export { EnrollmentPolicy };
//# sourceMappingURL=enrollment-policy.js.map
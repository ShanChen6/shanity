var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
let CoursePublishabilityValidator = class CoursePublishabilityValidator {
    validate(course, facts) {
        const errors = [];
        if (!course.title?.trim())
            errors.push('Course title is required');
        if (!course.description?.trim())
            errors.push('Course description is required');
        if (!course.thumbnail?.trim())
            errors.push('Course thumbnail is required');
        if (!course.ownerId && !course.instructorId)
            errors.push('A course owner or instructor is required');
        if (facts.sectionCount < 1)
            errors.push('At least one section is required');
        if (facts.sectionsWithoutLessons > 0)
            errors.push('Every section must contain at least one lesson');
        if (facts.lessonCount < 1)
            errors.push('At least one lesson is required');
        if (facts.lessonsWithoutContent > 0)
            errors.push('Every lesson must have text or video content');
        return errors;
    }
};
CoursePublishabilityValidator = __decorate([
    Injectable()
], CoursePublishabilityValidator);
export { CoursePublishabilityValidator };
//# sourceMappingURL=course-publishability.validator.js.map
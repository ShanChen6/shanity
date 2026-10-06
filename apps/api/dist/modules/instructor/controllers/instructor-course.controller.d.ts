import { StudentsProgressQueryDto } from '../dto/students-progress-query.dto.js';
import { type CourseOwnerRequest } from '../guards/course-owner.guard.js';
import { InstructorProgressService } from '../services/instructor-progress.service.js';
export declare class InstructorCourseController {
    private readonly progress;
    constructor(progress: InstructorProgressService);
    studentsProgress(req: CourseOwnerRequest, query: StudentsProgressQueryDto): Promise<{
        course: {
            id: string;
            title: string;
            totalStudents: number;
            avgProgressPercentage: number;
            completedStudents: number;
            completionRate: number;
        };
        students: {
            studentId: string;
            fullName: string;
            email: string;
            avatarUrl: string | null;
            enrolledAt: Date;
            lastAccessedAt: Date | null;
            status: import("../dto/students-progress-query.dto.js").StudentProgressStatus;
            progress: {
                percentage: number;
                completedLessons: number;
                totalLessons: number;
                completedRequiredLessons: number;
                totalRequiredLessons: number;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
    studentLessons(req: CourseOwnerRequest, studentId: string): Promise<{
        lessons: {
            lessonId: string;
            title: string;
            chapterTitle: string;
            isRequired: boolean;
            status: "NOT_STARTED" | import("../../progress/entities/lesson-progress.entity.js").LessonProgressStatus;
            completedAt: Date | null;
        }[];
        fullName: string;
        email: string;
        studentId: string;
    }>;
}

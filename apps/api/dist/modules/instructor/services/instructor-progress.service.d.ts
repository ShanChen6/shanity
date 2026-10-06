import { DatabaseService } from '../../../database/database.module.js';
import { LessonProgressStatus } from '../../progress/entities/lesson-progress.entity.js';
import type { StudentProgressStatus, StudentsProgressQueryDto } from '../dto/students-progress-query.dto.js';
import type { OwnedCourse } from '../guards/course-owner.guard.js';
export declare class InstructorProgressService {
    private readonly database;
    constructor(database: DatabaseService);
    private scoredStudents;
    studentsProgress(course: OwnedCourse, query: StudentsProgressQueryDto): Promise<{
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
            status: StudentProgressStatus;
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
    studentLessons(course: OwnedCourse, studentId: string): Promise<{
        lessons: {
            lessonId: string;
            title: string;
            chapterTitle: string;
            isRequired: boolean;
            status: "NOT_STARTED" | LessonProgressStatus;
            completedAt: Date | null;
        }[];
        fullName: string;
        email: string;
        studentId: string;
    }>;
}

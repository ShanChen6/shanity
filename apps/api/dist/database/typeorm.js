import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Course } from '../courses/course.entity.js';
import { Chapter } from '../courses/chapter.entity.js';
import { Enrollment } from '../courses/enrollment.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
import { LessonProgress } from '../modules/progress/entities/lesson-progress.entity.js';
import { User } from '../users/user.entity.js';
import { databaseConfig } from './config.js';
import { migrations } from './migrations/index.js';
import { Role, UserRole, AuthSession, AuthIdentity, OAuthRequest, AuthRateLimit, } from '../auth/auth.entities.js';
export function createAppDataSource() {
    return new DataSource({
        ...databaseConfig(),
        entities: [
            Course,
            Chapter,
            Enrollment,
            Lesson,
            LessonProgress,
            User,
            Role,
            UserRole,
            AuthSession,
            AuthIdentity,
            OAuthRequest,
            AuthRateLimit,
        ],
        migrations,
        migrationsTableName: 'typeorm_migrations',
        migrationsTransactionMode: 'all',
    });
}
//# sourceMappingURL=typeorm.js.map
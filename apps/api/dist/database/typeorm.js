import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Course } from '../courses/course.entity.js';
import { User } from '../users/user.entity.js';
import { databaseConfig } from './config.js';
import { migrations } from './migrations/index.js';
import { Role, UserRole, AuthSession, AuthIdentity, OAuthRequest, AuthRateLimit, } from '../auth/auth.entities.js';
export function createAppDataSource() {
    return new DataSource({
        ...databaseConfig(),
        entities: [
            Course,
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
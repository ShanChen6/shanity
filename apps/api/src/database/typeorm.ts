import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Course } from '../courses/course.entity.js';
import { Chapter } from '../courses/chapter.entity.js';
import { Enrollment } from '../courses/enrollment.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
import { User } from '../users/user.entity.js';
import { databaseConfig } from './config.js';
import { LessonProgress } from '../modules/progress/lesson-progress.entity.js';
import { migrations } from './migrations/index.js';
import {
  Role,
  UserRole,
  AuthSession,
  AuthIdentity,
  OAuthRequest,
  AuthRateLimit,
} from '../auth/auth.entities.js';

export function createAppDataSource(): DataSource {
  return new DataSource({
    ...databaseConfig(),
    entities: [
      Course,
      Chapter,
      Enrollment,
      Lesson,
      User,
      Role,
      UserRole,
      AuthSession,
      AuthIdentity,
      OAuthRequest,
      AuthRateLimit,
      LessonProgress,
    ],
    migrations,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'all',
  });
}

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Course } from '../courses/course.entity.js';
import { Chapter } from '../courses/chapter.entity.js';
import { Enrollment } from '../courses/enrollment.entity.js';
import { User } from '../users/user.entity.js';
import { databaseConfig } from './config.js';
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

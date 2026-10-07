import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Course } from '../courses/course.entity.js';
import { Chapter } from '../courses/chapter.entity.js';
import { Enrollment } from '../courses/enrollment.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
import { User } from '../users/user.entity.js';
import { databaseConfig } from './config.js';
import { LessonProgress } from '../modules/progress/entities/lesson-progress.entity.js';
import { QuizEntity } from '../modules/quiz/entities/quiz.entity.js';
import { QuizQuestionEntity } from '../modules/quiz/entities/quiz-question.entity.js';
import { QuizOptionEntity } from '../modules/quiz/entities/quiz-option.entity.js';
import { QuizAttemptEntity } from '../modules/quiz/entities/quiz-attempt.entity.js';
import { AttemptAnswerEntity } from '../modules/quiz/entities/attempt-answer.entity.js';
import { CoursePriceLog } from '../courses/course-price-log.entity.js';
import { WebhookLog } from '../modules/payment/entities/webhook-log.entity.js';
import { OrderItem } from '../modules/payment/entities/order-item.entity.js';
import { OrderAuditLog } from '../modules/payment/entities/order-audit-log.entity.js';
import { Order } from '../modules/payment/entities/order.entity.js';
import { PaymentTransaction } from '../modules/payment/entities/payment-transaction.entity.js';
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
      QuizEntity,
      QuizQuestionEntity,
      QuizOptionEntity,
      QuizAttemptEntity,
      AttemptAnswerEntity,
      Order,
      OrderItem,
      OrderAuditLog,
      CoursePriceLog,
      WebhookLog,
      PaymentTransaction,
    ],
    migrations,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'all',
  });
}

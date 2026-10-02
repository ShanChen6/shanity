import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import type { CreateCourseDto } from './courses.dto.js';
import type { Principal } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.module.js';

const uniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === '23505';

@Injectable()
export class CoursesService {
  constructor(private readonly database: DatabaseService) {}

  async create(principal: Principal, dto: CreateCourseDto) {
    const repository = this.database.dataSource.getRepository(Course);
    try {
      return await repository.save(
        repository.create({
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          shortDescription: dto.shortDescription,
          thumbnail: dto.thumbnail,
          ownerId: principal.id,
          status: CourseStatus.DRAFT,
        }),
      );
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Course slug already exists');
      throw error;
    }
  }

  list(principal: Principal) {
    const query = this.database.dataSource
      .getRepository(Course)
      .createQueryBuilder('course');
    if (!principal.roles.includes('admin'))
      query.where('course.ownerId = :ownerId', { ownerId: principal.id });
    return query
      .orderBy('course.createdAt', 'DESC')
      .addOrderBy('course.id', 'DESC')
      .getMany();
  }

  async get(principal: Principal, id: string) {
    const course = await this.database.dataSource
      .getRepository(Course)
      .findOne({
        where: principal.roles.includes('admin')
          ? { id }
          : { id, ownerId: principal.id },
      });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}
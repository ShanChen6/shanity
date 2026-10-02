var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import { DatabaseService } from '../database/database.module.js';
const uniqueViolation = (error) => error?.code === '23505';
let CoursesService = class CoursesService {
    database;
    constructor(database) {
        this.database = database;
    }
    async create(principal, dto) {
        const repository = this.database.dataSource.getRepository(Course);
        try {
            return await repository.save(repository.create({
                title: dto.title,
                slug: dto.slug,
                description: dto.description,
                shortDescription: dto.shortDescription,
                thumbnail: dto.thumbnail,
                ownerId: principal.id,
                status: CourseStatus.DRAFT,
            }));
        }
        catch (error) {
            if (uniqueViolation(error))
                throw new ConflictException('Course slug already exists');
            throw error;
        }
    }
    list(principal) {
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
    async get(principal, id) {
        const course = await this.database.dataSource
            .getRepository(Course)
            .findOne({
            where: principal.roles.includes('admin')
                ? { id }
                : { id, ownerId: principal.id },
        });
        if (!course)
            throw new NotFoundException('Course not found');
        return course;
    }
};
CoursesService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], CoursesService);
export { CoursesService };
//# sourceMappingURL=courses.service.js.map
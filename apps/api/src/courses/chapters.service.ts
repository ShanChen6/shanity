import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import { Course } from './course.entity.js';
import type {
  CreateChapterDto,
  ReorderChaptersDto,
  UpdateChapterDto,
} from './chapters.dto.js';

const MAX_POSITION = 2_147_483_647;

function findTemporaryPositions(reservedValues: number[], count: number) {
  const reserved = [...new Set(reservedValues)].sort((left, right) => left - right);
  const positions: number[] = [];
  let candidate = 0;

  for (const value of reserved) {
    while (candidate < value && positions.length < count)
      positions.push(candidate++);
    if (positions.length === count) return positions;
    if (candidate === value) candidate++;
  }

  while (candidate <= MAX_POSITION && positions.length < count)
    positions.push(candidate++);
  return positions.length === count ? positions : undefined;
}

@Injectable()
export class ChaptersService {
  constructor(private readonly dataSource: DataSource) {}

  create(courseId: string, dto: CreateChapterDto) {
    return this.dataSource.transaction(async (manager) => {
      const course = await manager.getRepository(Course).findOne({
        where: { id: courseId },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');

      let position = dto.position;
      if (position === undefined) {
        const aggregate = await manager
          .getRepository(Chapter)
          .createQueryBuilder('chapter')
          .select('MAX(chapter.position)', 'maxPosition')
          .where('chapter.courseId = :courseId', { courseId })
          .getRawOne<{ maxPosition: number | string | null }>();
        position = Number(aggregate?.maxPosition ?? -1) + 1;
      }

      const repository = manager.getRepository(Chapter);
      return repository.save(
        repository.create({
          courseId,
          title: dto.title,
          description: dto.description,
          position,
        }),
      );
    });
  }

  list(courseId: string) {
    return this.dataSource.getRepository(Chapter).find({
      where: { courseId },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateChapterDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Chapter);
      const existing = await repository.findOne({
        where: { id },
        select: { id: true, courseId: true },
      });
      if (!existing) throw new NotFoundException('Chapter not found');

      const course = await manager.getRepository(Course).findOne({
        where: { id: existing.courseId },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      const chapter = await repository.findOne({
        where: { id, courseId: course.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!chapter) throw new NotFoundException('Chapter not found');

      await repository.update({ id, courseId: course.id }, dto);
      return repository.findOneByOrFail({ id });
    });
  }

  async remove(id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Chapter);
      const existing = await repository.findOne({
        where: { id },
        select: { id: true, courseId: true },
      });
      if (!existing) throw new NotFoundException('Chapter not found');

      const course = await manager.getRepository(Course).findOne({
        where: { id: existing.courseId },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      const result = await repository.delete({ id, courseId: course.id });
      if (!result.affected) throw new NotFoundException('Chapter not found');
    });
  }

  reorder(courseId: string, dto: ReorderChaptersDto) {
    return this.dataSource.transaction(async (manager) => {
      const course = await manager.getRepository(Course).findOne({
        where: { id: courseId },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');

      const repository = manager.getRepository(Chapter);
      const chapters = await repository.find({
        where: { courseId },
        select: { id: true, position: true },
        lock: { mode: 'pessimistic_write' },
      });
      const submittedIds = new Set(dto.chapterOrders.map(({ id }) => id));
      const submittedPositions = dto.chapterOrders.map(({ position }) => position);
      if (
        dto.chapterOrders.length !== chapters.length ||
        submittedIds.size !== dto.chapterOrders.length ||
        chapters.some((chapter) => !submittedIds.has(chapter.id))
      )
        throw new BadRequestException(
          'chapterOrders must contain every chapter in this course exactly once',
        );
      if (new Set(submittedPositions).size !== submittedPositions.length)
        throw new BadRequestException('Chapter positions must be unique');

      const temporaryPositions = findTemporaryPositions(
        [
          ...chapters.map(({ position }) => position),
          ...submittedPositions,
        ],
        chapters.length,
      );
      if (!temporaryPositions)
        throw new BadRequestException('No safe temporary positions available');

      for (const [index, chapter] of chapters.entries()) {
        const result = await repository.update(
          { id: chapter.id, courseId },
          { position: temporaryPositions[index]! },
        );
        if (!result.affected) throw new NotFoundException('Chapter not found');
      }

      for (const chapter of dto.chapterOrders) {
        const result = await repository.update(
          { id: chapter.id, courseId },
          { position: chapter.position },
        );
        if (!result.affected) throw new NotFoundException('Chapter not found');
      }

      return repository.find({
        where: { courseId },
        order: { position: 'ASC', id: 'ASC' },
      });
    });
  }
}
import { CreateLessonDto, UpdateLessonDto } from './dto/lessons.dto.js';
import { LessonsService } from './lessons.service.js';
export declare class LessonsController {
    private readonly lessons;
    constructor(lessons: LessonsService);
    create(chapterId: string, dto: CreateLessonDto): Promise<import("./entities/lesson.entity.js").Lesson>;
    list(chapterId: string): Promise<import("./entities/lesson.entity.js").Lesson[]>;
    get(id: string): Promise<import("./entities/lesson.entity.js").Lesson>;
    update(id: string, dto: UpdateLessonDto): Promise<import("./entities/lesson.entity.js").Lesson>;
    remove(id: string): Promise<void>;
}

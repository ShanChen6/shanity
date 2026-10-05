import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class LessonOwnershipGuard implements CanActivate {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private findChapterOwnership;
    private findLessonOwnership;
}

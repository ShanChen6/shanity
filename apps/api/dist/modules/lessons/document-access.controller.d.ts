import type { Response } from 'express';
import { type LessonAccessRequest } from './guards/lesson-access.guard.js';
import { DocumentAccessService } from './document-access.service.js';
export declare class DocumentAccessController {
    private readonly documents;
    constructor(documents: DocumentAccessService);
    view(request: LessonAccessRequest, response: Response, id: string): Promise<void>;
    download(request: LessonAccessRequest, response: Response, id: string): Promise<void>;
    private deliver;
}

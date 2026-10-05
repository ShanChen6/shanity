import type { Request, Response } from 'express';
import { AuthConfig } from '../../auth/auth.config.js';
import { AuthService } from '../../auth/auth.service.js';
import { DocumentAccessService } from './document-access.service.js';
export declare class DocumentAccessController {
    private readonly auth;
    private readonly config;
    private readonly documents;
    constructor(auth: AuthService, config: AuthConfig, documents: DocumentAccessService);
    view(request: Request, response: Response, id: string): Promise<void>;
    download(request: Request, response: Response, id: string): Promise<void>;
    private deliver;
}

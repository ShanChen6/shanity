import { ArgumentsHost } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { AuthConfig } from './auth.config.js';
export declare class OAuthRedirectFilter implements ExceptionFilter {
    private readonly config;
    constructor(config: AuthConfig);
    catch(error: unknown, host: ArgumentsHost): void;
}

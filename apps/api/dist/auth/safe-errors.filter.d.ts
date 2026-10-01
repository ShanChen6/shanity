import { ArgumentsHost } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
export declare class SafeErrorsFilter implements ExceptionFilter {
    private readonly logger;
    catch(exception: unknown, host: ArgumentsHost): void;
}

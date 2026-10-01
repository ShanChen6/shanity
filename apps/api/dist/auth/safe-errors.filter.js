var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SafeErrorsFilter_1;
import { Catch, HttpException, Injectable, Logger, } from '@nestjs/common';
let SafeErrorsFilter = SafeErrorsFilter_1 = class SafeErrorsFilter {
    logger = new Logger(SafeErrorsFilter_1.name);
    catch(exception, host) {
        const response = host.switchToHttp().getResponse();
        if (exception instanceof HttpException) {
            const body = exception.getResponse();
            response
                .status(exception.getStatus())
                .json(typeof body === 'string'
                ? { statusCode: exception.getStatus(), message: body }
                : body);
            return;
        }
        this.logger.error('Unhandled request failure');
        response
            .status(500)
            .json({ statusCode: 500, message: 'Internal server error' });
    }
};
SafeErrorsFilter = SafeErrorsFilter_1 = __decorate([
    Injectable(),
    Catch()
], SafeErrorsFilter);
export { SafeErrorsFilter };
//# sourceMappingURL=safe-errors.filter.js.map
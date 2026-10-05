var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Get, Param, ParseUUIDPipe, Req, Res, UseGuards, } from '@nestjs/common';
import { LessonAccessGuard, } from './guards/lesson-access.guard.js';
import { DocumentAccessService } from './document-access.service.js';
let DocumentAccessController = class DocumentAccessController {
    documents;
    constructor(documents) {
        this.documents = documents;
    }
    view(request, response, id) {
        return this.deliver(request, response, id, 'view');
    }
    download(request, response, id) {
        return this.deliver(request, response, id, 'download');
    }
    async deliver(request, response, lessonId, behavior) {
        const document = await this.documents.open(lessonId, behavior, request.lessonAccess?.bypass === true);
        response.set({
            'Content-Type': document.mimeType,
            'Content-Length': String(document.fileSize),
            'Content-Disposition': contentDisposition(behavior, document.fileName),
            'Content-Security-Policy': "default-src 'none'; script-src 'none'; object-src 'none'; sandbox",
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
        });
        document.stream.on('error', () => response.destroy());
        document.stream.pipe(response);
    }
};
__decorate([
    Get(':id/document-view'),
    __param(0, Req()),
    __param(1, Res()),
    __param(2, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], DocumentAccessController.prototype, "view", null);
__decorate([
    Get(':id/document-download'),
    __param(0, Req()),
    __param(1, Res()),
    __param(2, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], DocumentAccessController.prototype, "download", null);
DocumentAccessController = __decorate([
    Controller('lessons'),
    UseGuards(LessonAccessGuard),
    __metadata("design:paramtypes", [DocumentAccessService])
], DocumentAccessController);
export { DocumentAccessController };
function contentDisposition(behavior, originalName) {
    const directive = behavior === 'view' ? 'inline' : 'attachment';
    const safe = originalName
        .replace(/[\r\n]/g, '')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\]/g, '_')
        .slice(0, 180);
    return `${directive}; filename="${safe || 'document'}"; filename*=UTF-8''${encodeURIComponent(originalName.replace(/[\r\n]/g, ''))}`;
}
//# sourceMappingURL=document-access.controller.js.map
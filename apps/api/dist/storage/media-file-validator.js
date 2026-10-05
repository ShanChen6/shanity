import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { MEDIA_LIMITS, MEDIA_MIME_TYPES, maxVideoBytes, } from './media-storage.constants.js';
const EXTENSIONS = {
    document: new Set(['.pdf', '.pptx', '.docx', '.zip', '.txt', '.md']),
    video: new Set(['.mp4', '.webm', '.mov']),
};
const MIME_EXTENSIONS = {
    'application/pdf': new Set(['.pdf']),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['.docx']),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': new Set(['.pptx']),
    'application/zip': new Set(['.zip']),
    'text/plain': new Set(['.txt']),
    'text/markdown': new Set(['.md']),
    'video/mp4': new Set(['.mp4']),
    'video/webm': new Set(['.webm']),
    'video/quicktime': new Set(['.mov']),
};
export async function validateMediaFile(file, metadata) {
    const buffer = Buffer.isBuffer(file) ? file : file.buffer;
    const kind = metadata?.kind;
    const originalName = Buffer.isBuffer(file)
        ? metadata?.originalName
        : file.originalname;
    const declaredType = Buffer.isBuffer(file)
        ? metadata?.contentType
        : file.mimetype;
    if (!kind || !originalName || !declaredType || !buffer.length)
        throw new BadRequestException('Media kind, original name, content type and bytes are required');
    const limit = kind === 'video' ? maxVideoBytes() : MEDIA_LIMITS.document;
    if (buffer.length > limit)
        throw new PayloadTooLargeException(`${kind} exceeds the ${limit} byte limit`);
    const extension = extname(originalName).toLowerCase();
    let detected = await fileTypeFromBuffer(buffer);
    if (!detected && kind === 'document' && isPlainText(buffer))
        detected = {
            mime: extension === '.md' ? 'text/markdown' : 'text/plain',
            ext: extension.slice(1),
        };
    const acceptedTypes = MEDIA_MIME_TYPES[kind];
    if (!EXTENSIONS[kind].has(extension) ||
        !detected ||
        !acceptedTypes.includes(detected.mime) ||
        detected.mime !== declaredType ||
        !MIME_EXTENSIONS[detected.mime]?.has(extension))
        throw new BadRequestException(`Invalid ${kind} bytes, MIME type or file extension`);
    return {
        buffer,
        contentType: detected.mime,
        originalName,
        metadata: { ...metadata, kind, contentType: detected.mime, originalName },
    };
}
function isPlainText(buffer) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    if (sample.includes(0))
        return false;
    const decoded = sample.toString('utf8');
    return !decoded.includes('\uFFFD') && /[\s\S]/u.test(decoded);
}
//# sourceMappingURL=media-file-validator.js.map
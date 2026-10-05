import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { validateMediaFile } from './media-file-validator.js';
import { MediaUrlSigner } from './media-url-signer.js';
export class LocalMediaStorageAdapter {
    options;
    provider = 'LOCAL';
    root;
    deliveryPath;
    signer;
    constructor(options) {
        this.options = options;
        this.root = resolve(options.root);
        this.deliveryPath = options.deliveryPath ?? '/lesson-media';
        this.signer = new MediaUrlSigner(options.signingSecret);
    }
    async upload(file, path, metadata) {
        const validated = await validateMediaFile(file, metadata);
        const destination = this.resolvePath(path);
        await mkdir(dirname(destination), { recursive: true });
        const handle = await open(destination, 'wx', 0o600);
        try {
            await handle.writeFile(validated.buffer);
        }
        catch (error) {
            await unlink(destination).catch(() => undefined);
            throw error;
        }
        finally {
            await handle.close();
        }
        return {
            filePath: this.normalizeKey(path),
            size: validated.buffer.length,
            contentType: validated.contentType,
            checksumSha256: createHash('sha256')
                .update(validated.buffer)
                .digest('hex'),
            metadata: validated.metadata,
        };
    }
    async delete(filePath) {
        try {
            await unlink(this.resolvePath(filePath));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async getSignedUrl(filePath, expiresInSeconds) {
        const key = this.normalizeKey(filePath);
        if (!Number.isInteger(expiresInSeconds) ||
            expiresInSeconds < 60 ||
            expiresInSeconds > 7200)
            throw new BadRequestException('Media URL expiry must be between 60 and 7200 seconds');
        await this.ensureExists(key);
        const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
        const signature = this.signer.sign(key, expires);
        return `${this.deliveryPath}/${key.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=${signature}`;
    }
    async getStream(filePath, range) {
        const path = this.resolvePath(filePath);
        await this.ensureExists(filePath);
        return createReadStream(path, range);
    }
    async ensureExists(filePath) {
        try {
            const info = await stat(this.resolvePath(filePath));
            if (!info.isFile())
                throw new NotFoundException('Media file not found');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                throw new NotFoundException('Media file not found');
            throw error;
        }
    }
    normalizeKey(filePath) {
        if (!filePath ||
            filePath.includes('\\') ||
            filePath.startsWith('/') ||
            filePath.split('/').some((part) => !part || part === '.' || part === '..'))
            throw new BadRequestException('Invalid media storage path');
        return filePath;
    }
    resolvePath(filePath) {
        const key = this.normalizeKey(filePath);
        const candidate = resolve(join(this.root, key));
        const fromRoot = relative(this.root, candidate);
        if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..')
            throw new BadRequestException('Invalid media storage path');
        return candidate;
    }
}
//# sourceMappingURL=local-media-storage.adapter.js.map
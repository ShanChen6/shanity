var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export const AVATAR_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
export class AvatarStorage {
}
let LocalAvatarStorage = class LocalAvatarStorage extends AvatarStorage {
    root = resolve(process.env.AVATAR_STORAGE_DIR ?? 'uploads/avatars');
    path(key) {
        if (!AVATAR_KEY.test(key))
            throw new NotFoundException();
        return join(this.root, key);
    }
    async put(key, data) {
        const path = this.path(key);
        await mkdir(this.root, { recursive: true });
        const file = await open(path, 'wx', 0o600);
        try {
            await file.writeFile(data);
        }
        catch (error) {
            await unlink(path).catch(() => undefined);
            throw error;
        }
        finally {
            await file.close();
        }
    }
    async read(key) {
        try {
            return await readFile(this.path(key));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                throw new NotFoundException();
            throw error;
        }
    }
    async delete(key) {
        try {
            await unlink(this.path(key));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
};
LocalAvatarStorage = __decorate([
    Injectable()
], LocalAvatarStorage);
export { LocalAvatarStorage };
//# sourceMappingURL=avatar-storage.js.map
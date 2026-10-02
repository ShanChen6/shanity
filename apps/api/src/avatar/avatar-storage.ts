import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Keys, never caller-provided paths or remote URLs, cross this boundary.
export const AVATAR_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
export abstract class AvatarStorage {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class LocalAvatarStorage extends AvatarStorage {
  private readonly root = resolve(
    process.env.AVATAR_STORAGE_DIR ?? 'uploads/avatars',
  );
  private path(key: string) {
    if (!AVATAR_KEY.test(key)) throw new NotFoundException();
    return join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(this.root, { recursive: true });
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(data);
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    } finally {
      await file.close();
    }
  }
  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException();
      throw error;
    }
  }
  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

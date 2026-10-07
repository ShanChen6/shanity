import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Server-generated keys only; a caller-supplied path never reaches the disk. */
export const PROOF_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$/;

export const PROOF_CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** Private store for bank-transfer proofs (chứng từ). Never served publicly. */
export abstract class PaymentProofStorage {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class LocalPaymentProofStorage extends PaymentProofStorage {
  private readonly root = resolve(
    process.env.PAYMENT_PROOF_STORAGE_DIR ?? 'uploads/payment-proofs',
  );

  private path(key: string) {
    if (!PROOF_KEY.test(key)) throw new NotFoundException('PROOF_NOT_FOUND');
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
        throw new NotFoundException('PROOF_NOT_FOUND');
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

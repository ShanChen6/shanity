import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { DatabaseService } from '../../../database/database.module.js';
import { OrderAuditAction } from '../entities/order-audit-log.entity.js';
import { orderLookup } from '../order-ref.js';
import {
  isBackOffice,
  OrderAuditService,
  type AdminRequestContext,
} from '../order-audit.service.js';
import {
  PaymentProofStorage,
  PROOF_CONTENT_TYPES,
  PROOF_KEY,
} from './payment-proof.storage.js';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const proofUrl = (orderId: string, key: string) =>
  `/api/v1/admin/orders/${orderId}/proofs/${key}`;

/**
 * Bank-transfer proofs for manual reconciliation. A proof belongs to exactly
 * one order: the upload is registered in the audit trail (PROOF_UPLOADED), and
 * that row is what authorises reading it back. Every read is audited too.
 */
@Injectable()
export class PaymentProofService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: PaymentProofStorage,
    private readonly audit: OrderAuditService,
  ) {}

  async upload(
    ref: string,
    file: Express.Multer.File | undefined,
    context: AdminRequestContext,
  ) {
    if (!isBackOffice(context.principal)) throw new ForbiddenException();
    if (!file?.buffer?.length) throw new BadRequestException('PROOF_REQUIRED');
    if (file.buffer.length > MAX_PROOF_BYTES)
      throw new PayloadTooLargeException('PROOF_TOO_LARGE');
    // Trust the bytes, not the client's Content-Type or file name.
    const detected = await fileTypeFromBuffer(file.buffer);
    const extension = detected ? EXTENSIONS[detected.mime] : undefined;
    if (!detected || !extension)
      throw new BadRequestException('PROOF_TYPE_NOT_SUPPORTED');

    const orderId = await this.resolveOrderId(ref);
    const key = `${randomUUID()}.${extension}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(key, file.buffer);
    try {
      await this.database.dataSource.transaction(async (manager) => {
        const actor = await this.audit.adminActor(manager, context);
        await this.audit.append(manager, {
          orderId,
          actor,
          action: OrderAuditAction.PROOF_UPLOADED,
          reason: 'Uploaded a payment proof for manual reconciliation',
          newState: {
            proofKey: key,
            contentType: detected.mime,
            size: file.buffer.length,
            sha256,
          },
        });
      });
    } catch (error) {
      // No audit row => no registered proof; do not leave an orphan file.
      await this.storage.delete(key);
      throw error;
    }
    return {
      proofKey: key,
      proofImageUrl: proofUrl(orderId, key),
      contentType: detected.mime,
      size: file.buffer.length,
    };
  }

  async read(ref: string, key: string, context: AdminRequestContext) {
    if (!isBackOffice(context.principal))
      throw new NotFoundException('PROOF_NOT_FOUND');
    if (!PROOF_KEY.test(key)) throw new NotFoundException('PROOF_NOT_FOUND');
    const orderId = await this.resolveOrderId(ref);
    const manager = this.database.dataSource.manager;
    if (!(await this.audit.hasProofUpload(manager, orderId, key)))
      throw new NotFoundException('PROOF_NOT_FOUND');
    const data = await this.storage.read(key);
    await this.audit.recordView(
      context,
      orderId,
      'Admin opened a payment proof',
      { target: 'proof', proofKey: key },
    );
    return {
      data,
      contentType:
        PROOF_CONTENT_TYPES[key.slice(key.lastIndexOf('.') + 1)] ??
        'application/octet-stream',
    };
  }

  private async resolveOrderId(ref: string) {
    const lookup = orderLookup(ref);
    if (!lookup) throw new NotFoundException('ORDER_NOT_FOUND');
    const [row] = await this.database.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM orders WHERE ${'id' in lookup ? 'id' : 'code'} = $1`,
      ['id' in lookup ? lookup.id : lookup.code],
    );
    if (!row) throw new NotFoundException('ORDER_NOT_FOUND');
    return row.id;
  }
}

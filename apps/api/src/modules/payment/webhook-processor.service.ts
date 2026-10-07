import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { WebhookLog, WebhookLogStatus } from './entities/webhook-log.entity.js';
import type { PaymentProviderEnum } from './interfaces/index.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import {
  PaymentSettlementService,
  type WebhookOutcome,
} from './payment-settlement.service.js';

const WEBHOOK_UNIQUE_INDEXES = [
  'idx_webhook_unique_event',
  'idx_webhook_unique_event_id',
];

const isProcessedDuplicate = (error: unknown) => {
  const databaseError = error as { code?: string; constraint?: string };
  return (
    databaseError?.code === '23505' &&
    WEBHOOK_UNIQUE_INDEXES.includes(databaseError.constraint ?? '')
  );
};

/**
 * The webhook pipeline, end to end:
 *   1 receive  -> 2 verify authenticity (provider) -> 3 persist raw event
 *   -> 4 idempotency + lock -> 5 state transition -> 6 fulfilment event
 * Steps 4-6 live in `PaymentSettlementService`.
 *
 * Contract with the gateway: a forged request is rejected (401) and leaves no
 * trace; every authenticated delivery is acknowledged with 200 - including the
 * 2nd..Nth delivery of the same transaction, which are recorded as DUPLICATE
 * and change nothing - so the gateway stops retrying. Only a processing error
 * returns 5xx, which makes the gateway retry safely (everything is idempotent).
 */
@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private readonly factory: PaymentProviderFactory,
    private readonly database: DatabaseService,
    private readonly settlement: PaymentSettlementService,
  ) {}

  async handleWebhook(
    name: PaymentProviderEnum,
    payload: Record<string, unknown>,
    headers: Record<string, any>,
    rawBody?: Buffer,
  ): Promise<WebhookOutcome> {
    // Step 2: authenticity. Nothing is stored for a request that fails it.
    const provider = this.factory.getProvider(name);
    const { isValid, ...fact } = await provider.verifyNotification({
      headers,
      payload,
      rawBody,
    });
    if (!isValid) {
      this.logger.warn(`Rejected unauthenticated ${name} notification`);
      throw new UnauthorizedException('INVALID_WEBHOOK_SIGNATURE');
    }

    // Step 3: persist the raw event first, in its own committed write, so even
    // a crash during processing leaves an audit trail.
    const logs = this.database.dataSource.getRepository(WebhookLog);
    const log = await logs.save(
      logs.create({
        provider: provider.providerName,
        eventId: fact.eventId ?? null,
        providerTransactionId: fact.providerTransactionId || null,
        payload: fact.rawPayload,
        status: WebhookLogStatus.PENDING,
      }),
    );

    // Steps 4-6.
    let result;
    try {
      result = await this.settlement.settle(provider.providerName, fact);
    } catch (error) {
      await this.finish(log.id, WebhookLogStatus.FAILED, null, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (result.status === 'ALREADY_PROCESSED') {
      await this.finish(log.id, WebhookLogStatus.DUPLICATE, result.status);
    } else {
      try {
        // Only transactions that left a ledger row are "consumed": an
        // acknowledged non-event must not block the id's real settlement.
        await this.finish(log.id, WebhookLogStatus.PROCESSED, result.status, {
          clearTransactionId: !result.recorded,
        });
      } catch (error) {
        // The unique index says another delivery of this event already holds
        // PROCESSED (a concurrent attack or a replay that slipped the early
        // exit). The money side is idempotent; just record this as DUPLICATE.
        if (!isProcessedDuplicate(error)) throw error;
        await this.finish(
          log.id,
          WebhookLogStatus.DUPLICATE,
          'ALREADY_PROCESSED',
        );
        return { status: 'ALREADY_PROCESSED' };
      }
    }
    return { status: result.status };
  }

  private async finish(
    id: string,
    status: WebhookLogStatus,
    outcome: string | null,
    extra: { errorMessage?: string; clearTransactionId?: boolean } = {},
  ) {
    await this.database.dataSource.query(
      `UPDATE webhook_logs
          SET status = $2, outcome = $3, error_message = $4, processed_at = now(),
              provider_transaction_id = CASE WHEN $5 THEN NULL ELSE provider_transaction_id END
        WHERE id = $1 AND status IN ('PENDING','FAILED')`,
      [
        id,
        status,
        outcome,
        extra.errorMessage ?? null,
        extra.clearTransactionId ?? false,
      ],
    );
  }
}

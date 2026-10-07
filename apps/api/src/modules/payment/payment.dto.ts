import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  Max,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MAX_ORDER_ITEMS } from './order-snapshot.js';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_ITEMS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  courseIds: string[];
}

export class VietQrWebhookDto {
  // Matches payment_transactions.provider_transaction_id (varchar(100)).
  @IsString() @IsNotEmpty() @MaxLength(100) transactionId: string;
  @IsInt() @IsPositive() @Max(Number.MAX_SAFE_INTEGER) amount: number;
  @IsString() @IsNotEmpty() @MaxLength(500) transferContent: string;
  // Some forwarders wrap the original bank notification. The complete HTTP
  // body is persisted regardless; this field is intentionally unconstrained.
  @IsOptional() @IsObject() rawPayload?: Record<string, unknown>;
}

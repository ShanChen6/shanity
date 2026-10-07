import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsUUID() courseId: string;
}

export class VietQrWebhookDto {
  @IsString() @IsNotEmpty() @MaxLength(128) transactionId: string;
  @IsInt() @IsPositive() amount: number;
  @IsString() @IsNotEmpty() @MaxLength(500) transferContent: string;
  // Some forwarders wrap the original bank notification. The complete HTTP
  // body is persisted regardless; this field is intentionally unconstrained.
  @IsOptional() @IsObject() rawPayload?: Record<string, unknown>;
}

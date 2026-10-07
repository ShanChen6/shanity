import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
} from 'class-validator';
import { OrderStatus } from '../entities/order.entity.js';
import {
  LEDGER_PROVIDERS,
  PaymentProviderEnum,
  type LedgerProvider,
} from '../interfaces/payment-provider.enum.js';

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
// PostgreSQL text cannot hold NUL; refuse it here instead of failing in SQL.
const noNul = () =>
  ValidateBy({
    name: 'noNul',
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'string' || !value.includes('\0'),
      defaultMessage: () => 'must not contain NUL characters',
    },
  });

export const ADMIN_ORDER_SORT_FIELDS = [
  'createdAt',
  'completedAt',
  'finalTotal',
  'code',
  'status',
  'studentName',
] as const;
export type AdminOrderSortField = (typeof ADMIN_ORDER_SORT_FIELDS)[number];

export class AdminOrdersQueryDto {
  /** Order code, student email/name, course title snapshot, provider txn id. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  @noNul()
  q?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsIn(LEDGER_PROVIDERS as readonly string[])
  provider?: LedgerProvider;

  /** Which timestamp `dateFrom` / `dateTo` bound. */
  @IsOptional()
  @IsIn(['createdAt', 'completedAt'])
  dateField?: 'createdAt' | 'completedAt';

  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  /** Bounds on the order's final total, in minor units. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  amountMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  amountMax?: number;

  @IsOptional()
  @IsIn(ADMIN_ORDER_SORT_FIELDS as readonly string[])
  sortBy?: AdminOrderSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Bank / gateway transaction references: letters, digits and `._:/-`. */
export const PROVIDER_TRANSACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{3,99}$/;

export class ReconcileOrderDto {
  /** The bank's / gateway's real transaction id for the money received. */
  @trim()
  @IsString()
  @Matches(PROVIDER_TRANSACTION_ID, {
    message: 'providerTransactionId must be the 4-100 character bank reference',
  })
  providerTransactionId: string;

  /** What actually arrived, minor units (dong / cents). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amountReceived: number;

  /** The channel the student paid through (never MANUAL_RECONCILED). */
  @IsEnum(PaymentProviderEnum)
  provider: PaymentProviderEnum;

  /** Mandatory justification; becomes the audit reason. */
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @noNul()
  note: string;

  /** Proof of the transfer: a file uploaded for this order, or an https URL. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2048)
  @noNul()
  proofImageUrl?: string;
}

export class RefundOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  refundAmount: number;

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @noNul()
  reason: string;

  @IsBoolean()
  notifyStudent: boolean;
}

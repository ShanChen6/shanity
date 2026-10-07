import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentProviderEnum } from './interfaces/payment-provider.enum.js';
import { MAX_ORDER_ITEMS } from './order-snapshot.js';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_ITEMS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  courseIds: string[];
}

export class InitiateCheckoutDto {
  @IsEnum(PaymentProviderEnum)
  provider: PaymentProviderEnum;

  // Must share the web app's origin; validated by CheckoutService.
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cancelUrl?: string;
}

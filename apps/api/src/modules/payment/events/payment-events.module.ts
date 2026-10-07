import { Global, Module } from '@nestjs/common';
import { PaymentEventBus } from './payment-event-bus.js';

/** Global so any bounded context can subscribe without importing payment. */
@Global()
@Module({ providers: [PaymentEventBus], exports: [PaymentEventBus] })
export class PaymentEventsModule {}

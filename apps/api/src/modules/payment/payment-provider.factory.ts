import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type PaymentProviderEnum,
} from './interfaces/index.js';

/**
 * Registry of the concrete gateways. Core services ask it for a provider by
 * enum at runtime and only ever see the `PaymentProvider` interface, so adding
 * a gateway means adding one adapter class and listing it in PaymentModule.
 */
@Injectable()
export class PaymentProviderFactory {
  private readonly registry = new Map<PaymentProviderEnum, PaymentProvider>();

  constructor(
    @Inject(PAYMENT_PROVIDERS) providers: readonly PaymentProvider[],
  ) {
    for (const provider of providers) {
      if (this.registry.has(provider.providerName))
        throw new Error(
          `Payment provider ${provider.providerName} is registered twice`,
        );
      this.registry.set(provider.providerName, provider);
    }
  }

  getProvider(name: PaymentProviderEnum): PaymentProvider {
    const provider = this.registry.get(name);
    if (!provider) throw new NotFoundException('PAYMENT_PROVIDER_UNAVAILABLE');
    return provider;
  }

  has(name: PaymentProviderEnum) {
    return this.registry.has(name);
  }

  /** Registered gateways that are configured and usable right now. */
  listAvailable(): PaymentProvider[] {
    return [...this.registry.values()].filter(
      (provider) => provider.isAvailable?.() ?? true,
    );
  }

  list(): PaymentProviderEnum[] {
    return [...this.registry.keys()];
  }
}

import { describe, expect, it, vi } from 'vitest';
import { OrderCompletedEvent } from './order-completed.event.js';
import { PaymentEventBus } from './payment-event-bus.js';

const event = () =>
  new OrderCompletedEvent('o', 'SHAN-1', 'u', ['c1', 'c2'], new Date());

describe('PaymentEventBus', () => {
  it('awaits every handler and delivers to subscribers of that type only', async () => {
    const bus = new PaymentEventBus();
    const seen: string[] = [];
    bus.subscribe(OrderCompletedEvent, async (e) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(`a:${e.orderCode}`);
    });
    bus.subscribe(OrderCompletedEvent, (e) => void seen.push(`b:${e.userId}`));
    class Other {}
    const other = vi.fn();
    bus.subscribe(Other, other);

    expect(await bus.publish(event())).toEqual([]);
    expect(seen.sort()).toEqual(['a:SHAN-1', 'b:u']);
    expect(other).not.toHaveBeenCalled();
  });

  it('isolates a failing handler: others still run and the failure is returned', async () => {
    const bus = new PaymentEventBus();
    const ok = vi.fn();
    bus.subscribe(OrderCompletedEvent, () => {
      throw new Error('boom');
    });
    bus.subscribe(OrderCompletedEvent, ok);
    const failures = await bus.publish(event());
    expect(ok).toHaveBeenCalledOnce();
    expect(failures).toHaveLength(1);
    expect((failures[0] as Error).message).toBe('boom');
  });

  it('supports unsubscribe and publishing with no subscribers', async () => {
    const bus = new PaymentEventBus();
    const handler = vi.fn();
    const off = bus.subscribe(OrderCompletedEvent, handler);
    off();
    expect(await bus.publish(event())).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });
});

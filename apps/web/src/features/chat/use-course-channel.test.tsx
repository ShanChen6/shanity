import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { message } from "./test-server";

type Handler = (data?: unknown) => void;
class Emitter {
  handlers = new Map<string, Set<Handler>>();
  bind(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }
  unbind(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }
  unbind_all() {
    this.handlers.clear();
  }
  emit(event: string, data?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(data);
  }
}

const fake = vi.hoisted(() => ({
  client: null as null | {
    connection: Emitter & { state: string };
    channel: Emitter;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("./realtime", () => ({
  realtimeClient: () => fake.client,
  courseChannelName: (id: string) => `presence-course-${id}`,
}));

const { useCourseChannel } = await import("./use-course-channel");

function newClient() {
  const connection = Object.assign(new Emitter(), { state: "connecting" });
  const channel = new Emitter();
  fake.client = {
    connection,
    channel,
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  };
  return fake.client;
}

const handlers = () => ({
  onMessage: vi.fn(),
  onHidden: vi.fn(),
  onMuted: vi.fn(),
  onReconnect: vi.fn(),
});

describe("useCourseChannel", () => {
  beforeEach(() => {
    fake.client = null;
  });

  it("is red and offline-capable when real-time is not configured", () => {
    const { result } = renderHook(() => useCourseChannel("c1", handlers()));
    expect(result.current).toEqual({ status: "disconnected", realtime: false });
  });

  it("goes amber, green, amber on a drop, and catches up on the way back", () => {
    const client = newClient();
    const on = handlers();
    const { result, unmount } = renderHook(() => useCourseChannel("c1", on));
    expect(client.subscribe).toHaveBeenCalledWith("presence-course-c1");
    expect(result.current.status).toBe("connecting");

    act(() => {
      client.connection.emit("state_change", { current: "connected" });
      client.channel.emit("pusher:subscription_succeeded");
    });
    expect(result.current.status).toBe("connected");
    expect(on.onReconnect).not.toHaveBeenCalled();

    act(() => client.connection.emit("state_change", { current: "connecting" }));
    expect(result.current.status).toBe("reconnecting");
    act(() => client.connection.emit("state_change", { current: "unavailable" }));
    expect(result.current.status).toBe("disconnected");

    act(() => {
      client.connection.emit("state_change", { current: "connected" });
      client.channel.emit("pusher:subscription_succeeded");
    });
    expect(result.current.status).toBe("connected");
    expect(on.onReconnect).toHaveBeenCalledTimes(1);

    unmount();
    expect(client.unsubscribe).toHaveBeenCalledWith("presence-course-c1");
  });

  it("stays amber when the room refuses the subscription", () => {
    const client = newClient();
    const { result } = renderHook(() => useCourseChannel("c1", handlers()));
    act(() => {
      client.connection.emit("state_change", { current: "connected" });
      client.channel.emit("pusher:subscription_error", { status: 403 });
    });
    expect(result.current.status).toBe("connecting");
  });

  it("hands the room's events to the latest handlers", () => {
    const client = newClient();
    const first = handlers();
    const second = handlers();
    const { rerender } = renderHook(({ on }) => useCourseChannel("c1", on), {
      initialProps: { on: first },
    });
    rerender({ on: second });
    const sent = message(1);
    act(() => {
      client.channel.emit("message_created", sent);
      client.channel.emit("message_hidden", { messageId: sent.id });
      client.channel.emit("user_muted", { userId: "u1", mutedUntil: "x" });
    });
    expect(first.onMessage).not.toHaveBeenCalled();
    expect(second.onMessage).toHaveBeenCalledWith(sent);
    expect(second.onHidden).toHaveBeenCalledWith({ messageId: sent.id });
    expect(second.onMuted).toHaveBeenCalledWith({ userId: "u1", mutedUntil: "x" });
    // One subscription for the room, however often handlers change.
    expect(client.subscribe).toHaveBeenCalledTimes(1);
  });
});

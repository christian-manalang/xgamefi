import { describe, it, expect, vi } from "vitest";
import { createSseStream } from "./sse";

describe("createSseStream", () => {
  it("emits the optional initial message followed by heartbeats", async () => {
    const listeners = new Map<string, ((channel: string, message: string) => void)[]>();
    let subscribed = false;

    const redis = {
      subscribe: vi.fn(async (channel: string) => {
        subscribed = true;
        return `OK`;
      }),
      unsubscribe: vi.fn(async () => "OK"),
      on: vi.fn((event: string, listener: (channel: string, message: string) => void) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(listener);
      }),
      off: vi.fn(),
    };

    const stream = createSseStream("order-events:test", redis, JSON.stringify({ paymentStatus: "PENDING" }));
    const reader = stream.getReader();

    // The message listener must be attached before subscribing so in-flight
    // Redis messages are not dropped.
    expect(redis.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(redis.subscribe).toHaveBeenCalledWith("order-events:test");

    // Initial message should arrive immediately, before subscription completes.
    const initial = await reader.read();
    expect(initial.done).toBe(false);
    expect(new TextDecoder().decode(initial.value)).toBe(
      `data: ${JSON.stringify({ paymentStatus: "PENDING" })}\n\n`,
    );

    // Wait for subscribe to finish and a heartbeat to fire.
    await vi.waitFor(() => expect(subscribed).toBe(true));
    const heartbeat = await reader.read();
    expect(heartbeat.done).toBe(false);
    expect(new TextDecoder().decode(heartbeat.value)).toBe(":keepalive\n\n");

    // A published message should be forwarded.
    const messageListeners = listeners.get("message") ?? [];
    expect(messageListeners.length).toBeGreaterThan(0);
    messageListeners[0]!("order-events:test", JSON.stringify({ paymentStatus: "PAID" }));
    const published = await reader.read();
    expect(published.done).toBe(false);
    expect(new TextDecoder().decode(published.value)).toBe(
      `data: ${JSON.stringify({ paymentStatus: "PAID" })}\n\n`,
    );

    await reader.cancel();
    expect(redis.off).toHaveBeenCalled();
    expect(redis.unsubscribe).toHaveBeenCalledWith("order-events:test");
  });
});

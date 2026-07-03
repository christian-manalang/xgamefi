const HEARTBEAT_INTERVAL_MS = 1500;

export function createSseStream(
  channel: string,
  redis: {
    subscribe: (c: string) => Promise<unknown>;
    unsubscribe?: (c: string) => Promise<unknown>;
    on: (event: string, listener: (channel: string, message: string) => void) => unknown;
    off?: (event: string, listener: (channel: string, message: string) => void) => unknown;
  },
  initialMessage?: string,
) {
  const encoder = new TextEncoder();
  let listener: ((channel: string, message: string) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send the current state immediately so a reconnecting client catches up.
      if (initialMessage) {
        controller.enqueue(encoder.encode(`data: ${initialMessage}\n\n`));
      }

      // Attach the listener BEFORE subscribing so any message published while
      // the subscribe command is in flight is still received.
      listener = (recvChannel, message) => {
        if (recvChannel === channel) {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      };
      redis.on("message", listener);

      try {
        await redis.subscribe(channel);
      } catch (err) {
        console.error(`[sse] subscribe failed for ${channel}`, err);
        controller.error(err);
        return;
      }

      // Keep the HTTP connection alive through idle timeouts (e.g. Node's
      // default 5s keep-alive) so short-lived SSE streams don't drop before
      // the next order-status event arrives.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(":keepalive\n\n"));
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (listener && redis.off) redis.off("message", listener);
      if (redis.unsubscribe) {
        redis.unsubscribe(channel).catch((err) => {
          console.error(`[sse] unsubscribe failed for ${channel}`, err);
        });
      }
    },
  });

  return stream;
}

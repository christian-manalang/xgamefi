const HEARTBEAT_INTERVAL_MS = 3000;

export function createSseStream(
  channel: string,
  redis: {
    subscribe: (c: string) => Promise<unknown>;
    on: (event: string, listener: (channel: string, message: string) => void) => unknown;
    off?: (event: string, listener: (channel: string, message: string) => void) => unknown;
  },
) {
  const encoder = new TextEncoder();
  let listener: ((channel: string, message: string) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await redis.subscribe(channel);
      listener = (recvChannel, message) => {
        if (recvChannel === channel) {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      };
      redis.on("message", listener);

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
    },
  });

  return stream;
}

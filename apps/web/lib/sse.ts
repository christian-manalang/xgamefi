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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await redis.subscribe(channel);
      listener = (recvChannel, message) => {
        if (recvChannel === channel) {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        }
      };
      redis.on("message", listener);
    },
    cancel() {
      if (listener && redis.off) redis.off("message", listener);
    },
  });

  return stream;
}

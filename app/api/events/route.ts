export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events feed of District activity.
 *
 * STUB: emits a single `ready` event, one heartbeat, then closes so nothing
 * hangs during the smoke suite. The data executor replaces the body with a
 * live subscription to `listEvents` / Supabase Realtime.
 */
export function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("ready", { stub: true, at: new Date().toISOString() });
      send("heartbeat", { stub: true });
      controller.close();
    },
    cancel() {
      // Client disconnected — nothing to unwind while this is a stub.
    },
  });

  request.signal.addEventListener("abort", () => {
    // Placeholder for teardown once a real subscription exists.
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}

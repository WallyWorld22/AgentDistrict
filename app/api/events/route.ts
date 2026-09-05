import { DemoRepository, getRepo } from "@/lib/data";
import type { DistrictEvent } from "@/lib/data/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/events — the District activity feed as Server-Sent Events
 * (BUILD_SPEC §4).
 *
 * 1. Replays the most recent events (oldest first) so a client that just
 *    connected has context.
 * 2. Streams anything published afterwards. In demo mode that means real
 *    mutations (a hire, a bid, an approval) *plus* a synthetic event every ~8s
 *    from a deterministic rotation, so the feed is alive on a fresh install.
 *
 * Query parameters:
 *   `?limit=20`   how many events to replay (1–50)
 *   `?replay=only` replay and close — handy for `curl` and tests
 */

const REPLAY_DEFAULT = 20;
const SYNTHETIC_INTERVAL_MS = 8_000;
const HEARTBEAT_MS = 15_000;
/** Hard stop so a forgotten tab cannot pin a serverless instance forever. */
const MAX_STREAM_MS = 240_000;

/** A deterministic rotation built from live District content. */
async function buildRotation(): Promise<DistrictEvent[]> {
  const repo = getRepo();
  const [agents, channels, jobs] = await Promise.all([
    repo.getTrendingAgents(5),
    repo.listChannels({ liveOnly: true, limit: 3 }),
    repo.listJobs({ status: "open", limit: 3 }),
  ]);

  const rotation: DistrictEvent[] = [];
  const at = () => new Date().toISOString();

  for (const agent of agents) {
    rotation.push({
      id: `rot-available-${agent.handle}`,
      kind: agent.status === "working" ? "collaboration" : "available",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} is ${agent.status === "working" ? "collaborating" : "available"}`,
      body: agent.tagline,
      cta_label: "View passport",
      cta_href: `/agents/${agent.handle}`,
      created_at: at(),
    });
  }
  for (const channel of channels) {
    rotation.push({
      id: `rot-live-${channel.slug}`,
      kind: "live",
      actor_type: "system",
      actor_id: null,
      actor_name: channel.title,
      headline: `${channel.title} is live`,
      body: channel.description,
      cta_label: "Watch live",
      cta_href: `/tv/${channel.slug}`,
      created_at: at(),
    });
  }
  for (const job of jobs) {
    rotation.push({
      id: `rot-job-${job.id}`,
      kind: "looking_for_help",
      actor_type: "human",
      actor_id: null,
      actor_name: "A buyer",
      headline: "Bounty still open for bids",
      body: job.title,
      cta_label: "Place a bid",
      cta_href: `/jobs/${job.id}`,
      created_at: at(),
    });
  }

  return rotation;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const replayOnly = url.searchParams.get("replay") === "only";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? REPLAY_DEFAULT)));

  const repo = getRepo();
  const recent = (await repo.listEvents({ limit })).slice().reverse();
  const rotation = replayOnly ? [] : await buildRotation();

  const encoder = new TextEncoder();
  let closed = false;
  const timers: ReturnType<typeof setInterval>[] = [];
  let stopAt: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  /** Release every timer and the event subscription. Safe to call twice. */
  const release = () => {
    for (const timer of timers) clearInterval(timer);
    timers.length = 0;
    if (stopAt !== undefined) clearTimeout(stopAt);
    stopAt = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client is gone. Tear the whole stream down rather than leaving
          // the 8s rotation and the 15s heartbeat firing into a dead
          // controller until the 240s hard stop.
          shutdown();
        }
      };
      const send = (event: string, data: unknown) => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const shutdown = () => {
        if (closed) return;
        closed = true;
        release();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      write(`retry: 5000\n\n`);
      send("ready", {
        mode: repo.mode,
        replayed: recent.length,
        synthetic: rotation.length > 0,
        at: new Date().toISOString(),
      });
      for (const event of recent) send("district", event);

      if (replayOnly || rotation.length === 0) {
        shutdown();
        return;
      }

      // Real mutations, when the in-memory adapter can publish them.
      if (repo instanceof DemoRepository) {
        unsubscribe = repo.subscribe((event) => send("district", event));
      }

      let cursor = 0;
      timers.push(
        setInterval(() => {
          const template = rotation[cursor % rotation.length];
          cursor += 1;
          send("district", {
            ...template,
            id: `${template.id}-${cursor}`,
            created_at: new Date().toISOString(),
            synthetic: true,
          });
        }, SYNTHETIC_INTERVAL_MS),
      );
      timers.push(
        setInterval(() => {
          write(`: heartbeat ${Date.now()}\n\n`);
        }, HEARTBEAT_MS),
      );

      stopAt = setTimeout(shutdown, MAX_STREAM_MS);
      request.signal.addEventListener("abort", shutdown);
    },
    cancel() {
      closed = true;
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

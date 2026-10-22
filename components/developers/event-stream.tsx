"use client";

import * as React from "react";
import { Radio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";

type FeedLine = { key: string; kind: string; headline: string; body: string };

type Phase = "idle" | "connecting" | "streaming" | "done" | "error";

const REPLAY_URL = "/api/events?replay=only&limit=10";

/**
 * A real `EventSource` reader for `/api/events` (BUILD_SPEC §4 `/developers`).
 *
 * Two details that matter:
 *
 * 1. `?replay=only` replays the last N events and then **closes**. A browser
 *    `EventSource` treats any close as a dropped connection and reconnects
 *    after the server's `retry:` interval, so this closes the source itself
 *    once the `ready` frame's `replayed` count has arrived. Without that the
 *    widget would re-fetch the same ten events every five seconds forever.
 * 2. The source is closed on unmount, so navigating away never leaves a stream
 *    pinned open.
 */
export function EventStreamWidget() {
  const [lines, setLines] = React.useState<FeedLine[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const sourceRef = React.useRef<EventSource | null>(null);
  const expected = React.useRef<number | null>(null);
  const seen = React.useRef(0);

  const stop = React.useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  function connect() {
    stop();
    setLines([]);
    setPhase("connecting");
    expected.current = null;
    seen.current = 0;

    const source = new EventSource(REPLAY_URL);
    sourceRef.current = source;

    source.addEventListener("ready", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          replayed?: number;
        };
        expected.current = typeof payload.replayed === "number" ? payload.replayed : null;
      } catch {
        expected.current = null;
      }
      setPhase("streaming");
      if (expected.current === 0) {
        stop();
        setPhase("done");
      }
    });

    source.addEventListener("district", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          id?: string;
          kind?: string;
          headline?: string;
          body?: string;
        };
        seen.current += 1;
        setLines((current) => [
          ...current,
          {
            key: `${payload.id ?? "event"}-${seen.current}`,
            kind: payload.kind ?? "district",
            headline: payload.headline ?? "",
            body: payload.body ?? "",
          },
        ]);
      } catch {
        /* a partial frame — skip it */
      }
      if (expected.current !== null && seen.current >= expected.current) {
        stop();
        setPhase("done");
      }
    });

    source.onerror = () => {
      // `replay=only` ends by closing the stream, which surfaces here. Anything
      // received already is a success; nothing received is a real failure.
      stop();
      setPhase((current) => (seen.current > 0 || current === "done" ? "done" : "error"));
    };
  }

  const streaming = phase === "connecting" || phase === "streaming";

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={phase === "connecting"}
          onClick={connect}
        >
          <Radio className="size-3.5" aria-hidden="true" />
          {phase === "idle" ? "Open the stream" : "Replay again"}
        </Button>
        {streaming ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              stop();
              setPhase("done");
            }}
          >
            <Square className="size-3.5" aria-hidden="true" />
            Stop
          </Button>
        ) : null}
        <span
          className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold text-muted"
          role="status"
        >
          {phase === "streaming" ? (
            <>
              <LiveDot color="bg-red" size="sm" />
              Receiving
            </>
          ) : phase === "done" ? (
            <>
              <LiveDot color="bg-green" size="sm" />
              {lines.length} {lines.length === 1 ? "event" : "events"} received
            </>
          ) : phase === "error" ? (
            "Could not read the stream"
          ) : phase === "connecting" ? (
            "Connecting…"
          ) : (
            "Idle"
          )}
        </span>
      </div>

      {phase === "error" ? (
        <p role="alert" className="m-0 text-[11.5px] font-semibold text-red">
          Could not read <code className="font-mono">{REPLAY_URL}</code>.
        </p>
      ) : null}

      {lines.length > 0 ? (
        <ul className="m-0 grid max-h-[260px] list-none gap-1.5 overflow-y-auto p-0">
          {lines.map((line) => (
            <li
              key={line.key}
              className="bg-inset-surface rounded-[12px] border border-[#1c2638] px-2.5 py-1.5"
            >
              <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-blue uppercase">
                {line.kind.replace(/_/g, " ")}
              </small>
              <span className="block text-[11.5px] font-bold text-text">{line.headline}</span>
              {line.body ? (
                <span className="block truncate text-[10.5px] text-muted">{line.body}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[11px] leading-relaxed text-muted">
          Every hire, bid, delivery and approval lands in the District feed, served here
          as Server-Sent Events. This widget opens a real{" "}
          <code className="font-mono">EventSource</code> against{" "}
          <code className="font-mono">{REPLAY_URL}</code>, which replays the last ten and
          closes. Without the query string the stream stays open: after the replay it
          sends synthetic activity frames, and pushes new events live only in demo mode.
        </p>
      )}
    </div>
  );
}

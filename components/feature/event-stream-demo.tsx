"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";

type FeedLine = { id: string; kind: string; headline: string };

/**
 * A live `/api/events` reader (BUILD_SPEC §4 `/developers`).
 *
 * Uses `?replay=only`, which replays the last N events and then *closes*, so
 * opening this page cannot leave a stream pinned open in the background.
 */
export function EventStreamDemo() {
  const [lines, setLines] = React.useState<FeedLine[]>([]);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");

  async function run() {
    setState("loading");
    setLines([]);
    try {
      const response = await fetch("/api/events?replay=only&limit=10");
      const text = await response.text();
      const parsed: FeedLine[] = [];
      for (const block of text.split("\n\n")) {
        if (!block.startsWith("event: district")) continue;
        const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as {
            id: string;
            kind: string;
            headline: string;
          };
          parsed.push({ id: event.id, kind: event.kind, headline: event.headline });
        } catch {
          /* a partial frame — skip it */
        }
      }
      setLines(parsed);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={state === "loading"}
        onClick={run}
      >
        <LiveDot color="bg-green" size="sm" />
        Replay the last 10 events
      </Button>

      {state === "error" ? (
        <p role="alert" className="m-0 text-[11.5px] font-semibold text-red">
          Could not read the stream.
        </p>
      ) : null}

      {lines.length > 0 ? (
        <ul className="m-0 grid max-h-[220px] list-none gap-1.5 overflow-y-auto p-0">
          {lines.map((line, index) => (
            <li
              key={`${line.id}-${index}`}
              className="bg-inset-surface rounded-[12px] border border-[#1c2638] px-2.5 py-1.5"
            >
              <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-blue uppercase">
                {line.kind.replace(/_/g, " ")}
              </small>
              <span className="block text-[11.5px] text-ink">{line.headline}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

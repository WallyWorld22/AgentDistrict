import type { CSSProperties } from "react";
import type { Agent } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/live-dot";
import { LoungeStyles } from "@/components/lounge/lounge-styles";

export type StageSceneProps = {
  title: string;
  hosts: Agent[];
  isLive: boolean;
  schedule?: string;
  gradient?: string;
  /** `hero` is the featured stage on /tv; `full` is the channel player. */
  size?: "hero" | "full";
  className?: string;
};

const DEFAULT_GRADIENT = "linear-gradient(135deg,#297dff,#df6cff)";

/**
 * The District TV stage — the set the show is actually shot on.
 *
 * A back wall carrying the show's name in neon, a couch, and the host agents
 * sitting on it. The heads rock gently (`ad-lounge-talk`) and a small level
 * meter runs under the host who is currently talking, which is the cheapest
 * honest way to say "this is a live render, not a video file" — see the
 * "Autonomous studio runtime" tiles on `/tv` for what that means.
 *
 * Server-rendered; the only motion is CSS, frozen by
 * `prefers-reduced-motion: reduce` like everything else in the District.
 */
export function StageScene({
  title,
  hosts,
  isLive,
  schedule,
  gradient,
  size = "full",
  className,
}: StageSceneProps) {
  const cast = hosts.slice(0, 3);

  return (
    <div
      data-testid="tv-stage"
      className={cn(
        "relative overflow-hidden rounded-[18px] border border-[#31415f]",
        size === "hero"
          ? "min-h-[220px] sm:min-h-[260px]"
          : "min-h-[260px] sm:min-h-[340px]",
        className,
      )}
      style={{ backgroundImage: gradient ?? DEFAULT_GRADIENT }}
    >
      <LoungeStyles />

      {/* Studio wall: darken the gradient into a room. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(8,12,22,.18),rgba(6,9,16,.86)_72%)]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(5,7,13,.92))]"
      />

      {/* Neon show title on the back wall */}
      <p
        aria-hidden="true"
        className={cn(
          // Below the LIVE chip on narrow screens, beside it above.
          "ad-lounge-neon absolute top-12 left-1/2 m-0 max-w-[86%] -translate-x-1/2 text-center sm:top-4",
          "font-black text-[#bfe6ff] italic [text-shadow:0_0_12px_rgba(90,190,255,.95),0_0_34px_rgba(60,140,255,.6)]",
          size === "hero" ? "text-[17px] sm:text-[22px]" : "text-[20px] sm:text-[30px]",
        )}
      >
        {title}
      </p>

      {/* Live bar */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8a2c41] bg-[#2a0d15] px-2.5 py-1 text-[10px] font-extrabold text-[#ff8293]">
            <LiveDot color="bg-red" size="sm" />
            LIVE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#26324b] bg-[#080d17]/85 px-2.5 py-1 text-[10px] font-extrabold text-[#bdc6da]">
            {schedule ?? "Scheduled"}
          </span>
        )}
      </div>
      {/* Couch + hosts */}
      <div className="absolute inset-x-0 bottom-0">
        <ul className="m-0 flex list-none items-end justify-center gap-4 p-0 sm:gap-9">
          {cast.map((host, index) => (
            <Host key={host.id} host={host} index={index} live={isLive} size={size} />
          ))}
          {cast.length === 0 ? (
            <li
              aria-hidden="true"
              className={cn(size === "hero" ? "text-[46px]" : "text-[62px]")}
            >
              📺
            </li>
          ) : null}
        </ul>
        <div
          aria-hidden="true"
          className="relative h-[26px] rounded-t-[22px] border-x border-t border-[#6d4733] bg-[linear-gradient(180deg,#6a4433,#3a2318)] shadow-[0_-14px_36px_rgba(0,0,0,.5)] sm:h-[34px]"
        />
      </div>
    </div>
  );
}

function Host({
  host,
  index,
  live,
  size,
}: {
  host: Agent;
  index: number;
  live: boolean;
  size: "hero" | "full";
}) {
  const gradient = host.avatar_gradient ?? "linear-gradient(135deg,#1d2a63,#4a3aa8)";
  const head =
    size === "hero"
      ? "size-12 text-[24px] sm:size-14 sm:text-[28px]"
      : "size-14 text-[28px] sm:size-16 sm:text-[34px]";
  const body =
    size === "hero"
      ? "h-[54px] w-[70px] sm:h-[62px] sm:w-[84px]"
      : "h-[62px] w-[86px] sm:h-[74px] sm:w-[100px]";

  return (
    <li className="relative flex flex-col items-center">
      <span
        aria-hidden="true"
        className={cn(
          "ad-lounge-talk relative z-10 grid place-items-center rounded-full border border-white/15",
          "shadow-[0_10px_26px_rgba(0,0,0,.55)]",
          head,
        )}
        style={
          {
            backgroundImage: gradient,
            "--float-delay": `${index * 0.35}s`,
          } as CSSProperties
        }
      >
        {host.avatar_emoji}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "-mt-3 grid place-items-start justify-center rounded-t-[26px] border border-b-0 border-white/12 pt-2.5",
          body,
        )}
        style={{
          backgroundImage: `linear-gradient(180deg,rgba(255,255,255,.16),rgba(0,0,0,.62)), ${gradient}`,
        }}
      >
        <span className="max-w-full truncate px-1.5 text-[8.5px] font-black tracking-[0.14em] text-white/85 uppercase">
          {host.name}
        </span>
      </span>
      {live ? (
        <span
          aria-hidden="true"
          className="absolute -top-2 right-0 flex h-4 items-end gap-[2px]"
        >
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              className="ad-lounge-bar block h-full w-[3px] rounded-full bg-[#7ef0c4]"
              style={{ "--float-delay": `${index * 0.2 + bar * 0.15}s` } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
    </li>
  );
}

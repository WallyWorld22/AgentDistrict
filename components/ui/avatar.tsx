import * as React from "react";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "./status-pill";

const SIZES = {
  xs: "size-7 rounded-[9px] text-[12px]",
  sm: "size-9 rounded-[11px] text-[15px]",
  md: "size-[42px] rounded-[14px] text-[18px]",
  lg: "size-14 rounded-[18px] text-[24px]",
  xl: "size-20 rounded-[26px] text-[34px]",
} as const;

const DOT_SIZES = {
  xs: "size-2 border",
  sm: "size-2.5 border-2",
  md: "size-3 border-2",
  lg: "size-3.5 border-2",
  xl: "size-4 border-[3px]",
} as const;

export type AvatarSize = keyof typeof SIZES;

export type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  size?: AvatarSize;
  /** Initials or a single glyph. */
  children?: React.ReactNode;
  /** Set true for a circle instead of a squircle. */
  round?: boolean;
};

/** Human avatar — gradient chip with initials. */
export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { size = "md", round = false, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br from-[#1a86ff] to-[#9558ff]",
        "leading-none font-extrabold text-white",
        SIZES[size],
        round && "rounded-full",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
});

/** "Austin Champion" → "AC". Deterministic, safe for empty input. */
export function initialsFrom(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic per-handle gradients. Seeded content and screenshots must be
 * stable, so this is a pure hash — never `Math.random()`.
 */
const AGENT_GRADIENTS = [
  "linear-gradient(135deg,#18375a,#1f6d8c)",
  "linear-gradient(135deg,#1d2a63,#4a3aa8)",
  "linear-gradient(135deg,#123a45,#1f7f74)",
  "linear-gradient(135deg,#3a1f5c,#8a4bd1)",
  "linear-gradient(135deg,#492036,#c04a6e)",
  "linear-gradient(135deg,#1a3a2b,#3aa06a)",
  "linear-gradient(135deg,#4a3410,#c48b2a)",
  "linear-gradient(135deg,#0f2c50,#3a7ad4)",
  "linear-gradient(135deg,#2a1c4f,#6b4bd6)",
  "linear-gradient(135deg,#173c4f,#2f9bb5)",
  "linear-gradient(135deg,#432752,#b25ad0)",
  "linear-gradient(135deg,#12314a,#2b6f9e)",
] as const;

export function gradientForHandle(handle: string): string {
  const key = String(handle ?? "");
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % AGENT_GRADIENTS.length;
  return AGENT_GRADIENTS[index];
}

const STATUS_DOT: Record<AgentStatus, string> = {
  available: "bg-green",
  working: "bg-blue",
  live: "bg-red",
  collaborating: "bg-purple",
  hiring: "bg-yellow",
  offline: "bg-[#5c687f]",
};

export type AgentAvatarProps = Omit<AvatarProps, "children"> & {
  /** Emoji identity, e.g. 🔭 for Scout. */
  emoji: string;
  /** Handle drives the fallback gradient so an agent always looks the same. */
  handle?: string;
  /** CSS gradient string from `agents.avatar_gradient`; wins over the handle. */
  gradient?: string;
  name?: string;
  /** Renders the presence dot from `agents.status`. */
  status?: AgentStatus;
};

/**
 * Agent avatar — the emoji identity on its own gradient, per
 * `agents.avatar_emoji` + `agents.avatar_gradient` (BUILD_SPEC §2), with an
 * optional presence dot.
 */
export const AgentAvatar = React.forwardRef<HTMLSpanElement, AgentAvatarProps>(
  function AgentAvatar(
    {
      emoji,
      handle,
      gradient,
      name,
      status,
      size = "md",
      round = false,
      className,
      style,
      ...props
    },
    ref,
  ) {
    const label = name ?? handle;
    return (
      <span
        ref={ref}
        className={cn("relative inline-grid shrink-0", className)}
        {...props}
      >
        <span
          className={cn(
            "grid place-items-center border border-[#31566e] leading-none",
            SIZES[size],
            round && "rounded-full",
          )}
          style={{
            backgroundImage: gradient ?? gradientForHandle(handle ?? emoji),
            ...style,
          }}
          role="img"
          aria-label={label ? `${label} avatar` : "Agent avatar"}
        >
          <span aria-hidden="true">{emoji}</span>
        </span>
        {status ? (
          <span
            className={cn(
              "absolute right-0 bottom-0 translate-x-[15%] translate-y-[15%]",
              "rounded-full border-[#0c111b]",
              DOT_SIZES[size],
              STATUS_DOT[status],
            )}
            aria-hidden="true"
          />
        ) : null}
      </span>
    );
  },
);

/** Overlapping avatar row used by guild cards. */
export function AvatarStack({
  className,
  children,
  overflow,
}: {
  className?: string;
  children: React.ReactNode;
  /** e.g. 3 → renders a trailing "+3" chip. */
  overflow?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center [&>*]:-mr-2 [&>*]:rounded-full [&>*]:ring-2 [&>*]:ring-[#0f1623]",
        className,
      )}
    >
      {children}
      {overflow && overflow > 0 ? (
        <span className="grid size-9 place-items-center rounded-full bg-[#171f31] text-[11px] font-extrabold text-[#aeb9ce]">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

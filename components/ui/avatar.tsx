import * as React from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-7 rounded-[9px] text-[12px]",
  sm: "size-9 rounded-[11px] text-[15px]",
  md: "size-[42px] rounded-[14px] text-[18px]",
  lg: "size-14 rounded-[18px] text-[24px]",
  xl: "size-20 rounded-[26px] text-[34px]",
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
export function Avatar({
  size = "md",
  round = false,
  className,
  children,
  ...props
}: AvatarProps) {
  return (
    <span
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
}

export type AgentAvatarProps = Omit<AvatarProps, "children"> & {
  /** Emoji identity, e.g. 🔭 for Scout. */
  emoji: string;
  /** CSS gradient string from `agents.avatar_gradient`. */
  gradient?: string;
  name?: string;
};

/**
 * Agent avatar — the emoji identity on its own gradient, per
 * `agents.avatar_emoji` + `agents.avatar_gradient` (BUILD_SPEC §2).
 */
export function AgentAvatar({
  emoji,
  gradient,
  name,
  size = "md",
  round = false,
  className,
  style,
  ...props
}: AgentAvatarProps) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border border-[#31566e] leading-none",
        SIZES[size],
        round && "rounded-full",
        className,
      )}
      style={{
        backgroundImage: gradient ?? "linear-gradient(135deg,#18375a,#1f6d8c)",
        ...style,
      }}
      role="img"
      aria-label={name ? `${name} avatar` : "Agent avatar"}
      {...props}
    >
      <span aria-hidden="true">{emoji}</span>
    </span>
  );
}

/** Overlapping avatar row used by guild cards. */
export function AvatarStack({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center [&>*]:-mr-2 [&>*]:ring-2 [&>*]:ring-[#0f1623]", className)}>
      {children}
    </div>
  );
}

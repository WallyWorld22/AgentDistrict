import { Pill, type PillProps, type PillVariant } from "./pill";
import { LiveDot } from "./live-dot";
import { cn } from "@/lib/utils";

/** Mirrors the `agent_status` Postgres enum in BUILD_SPEC §2. */
export type AgentStatus =
  | "available"
  | "working"
  | "live"
  | "collaborating"
  | "hiring"
  | "offline";

const STATUS: Record<
  AgentStatus,
  { label: string; variant: PillVariant; glyph: string; dot?: string }
> = {
  available: { label: "AVAILABLE", variant: "green", glyph: "●", dot: "bg-green" },
  working: { label: "WORKING", variant: "blue", glyph: "◌" },
  live: { label: "LIVE", variant: "live", glyph: "●", dot: "bg-red" },
  collaborating: { label: "COLLABORATING", variant: "purple", glyph: "↔" },
  hiring: { label: "HIRING", variant: "yellow", glyph: "＋" },
  offline: { label: "OFFLINE", variant: "default", glyph: "○" },
};

export type StatusPillProps = {
  status: AgentStatus;
  size?: PillProps["size"];
  className?: string;
};

export function StatusPill({ status, size = "md", className }: StatusPillProps) {
  const meta = STATUS[status] ?? STATUS.offline;
  return (
    <Pill variant={meta.variant} size={size} className={cn("uppercase", className)}>
      {meta.dot ? (
        <LiveDot color={meta.dot} size="sm" />
      ) : (
        <span aria-hidden="true">{meta.glyph}</span>
      )}
      {meta.label}
    </Pill>
  );
}

export function statusLabel(status: AgentStatus): string {
  return (STATUS[status] ?? STATUS.offline).label;
}

/** Pill variant that matches a status — handy for tinting related chrome. */
export function statusVariant(status: AgentStatus): PillVariant {
  return (STATUS[status] ?? STATUS.offline).variant;
}

import { cn } from "@/lib/utils";

export type ProgressProps = {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  className?: string;
  label?: string;
  /** Slightly taller bar for hero/run views. */
  size?: "sm" | "md";
};

export function Progress({ value, className, label, size = "sm" }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className={cn(
        "w-full overflow-hidden rounded-full bg-[#151e2f]",
        size === "sm" ? "h-[7px]" : "h-2.5",
        className,
      )}
    >
      <span
        className="block h-full rounded-full bg-gradient-to-r from-[#3ea5ff] to-[#8b5bff] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

import type { OrderStatus } from "@/lib/data/types";
import { Pill, type PillVariant } from "@/components/ui/pill";

/** Status → pill colour. Shared by the orders index, the run page and rows. */
export const ORDER_STATUS_VARIANT: Record<OrderStatus, PillVariant> = {
  queued: "yellow",
  running: "blue",
  delivered: "purple",
  approved: "green",
  disputed: "red",
  cancelled: "default",
  failed: "red",
};

/** Status → progress-bar tone. */
export const ORDER_PROGRESS_TONE: Record<
  OrderStatus,
  "primary" | "green" | "yellow" | "red" | "cyan"
> = {
  queued: "yellow",
  running: "primary",
  delivered: "cyan",
  approved: "green",
  disputed: "red",
  cancelled: "red",
  failed: "red",
};

/** One line of plain English per status — colour is never the only signal. */
export const ORDER_STATUS_COPY: Record<OrderStatus, string> = {
  queued: "Queued — the agent has the brief and is about to start.",
  running: "Running — your credits are held, not spent.",
  delivered: "Delivered — check the output, then approve or dispute it.",
  approved: "Approved — 90% paid out to the agent, 10% District fee.",
  disputed: "Disputed — the hold has been returned to your wallet.",
  cancelled: "Cancelled — nothing ran and nothing was charged.",
  failed: "Failed — the run could not complete and you were refunded.",
};

export function OrderStatusPill({
  status,
  size = "md",
}: {
  status: OrderStatus;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Pill variant={ORDER_STATUS_VARIANT[status]} size={size}>
      {status.toUpperCase()}
    </Pill>
  );
}

import Link from "next/link";
import type { WalletTransaction } from "@/lib/data/types";
import { TRANSACTION_LABELS } from "@/lib/data/ext/economy";
import { cn, formatCents, timeAgo } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";

/**
 * The wallet ledger.
 *
 * `amount_cents` is signed by cash-flow direction, and each order contributes
 * exactly **one** money-out row — `hold` while it is in flight, replaced by
 * `release` once approved — so the table never double-counts a run.
 */
export function TransactionsTable({
  transactions,
  now,
}: {
  transactions: WalletTransaction[];
  now: number;
}) {
  if (transactions.length === 0) {
    return <p className="m-0 text-[12px] text-muted">No transactions yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#1c2638]">
      <table
        className="w-full min-w-[520px] border-collapse text-left text-[11.5px]"
      >
        <caption className="sr-only">Wallet transactions, newest first</caption>
        <thead>
          <tr className="bg-[#0c1321]">
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Kind
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Memo
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              When
            </th>
            <th
              scope="col"
              className="border-b border-[#1c2638] px-3 py-2 text-right font-extrabold text-muted"
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const meta = TRANSACTION_LABELS[tx.kind] ?? {
              label: tx.kind,
              tone: "default" as const,
            };
            return (
              <tr key={tx.id} className="odd:bg-white/[.015]">
                <td className="border-b border-[#141c2b] px-3 py-2 align-top">
                  <Pill variant={meta.tone} size="sm">
                    {meta.label}
                  </Pill>
                </td>
                <td className="border-b border-[#141c2b] px-3 py-2 align-top text-ink">
                  <span className="block">{tx.memo}</span>
                  {tx.order_id ? (
                    <Link
                      href={`/orders/${tx.order_id}`}
                      className="mt-0.5 inline-block text-[10.5px] font-extrabold text-blue hover:text-cyan"
                    >
                      View run →
                    </Link>
                  ) : null}
                </td>
                <td className="border-b border-[#141c2b] px-3 py-2 align-top whitespace-nowrap text-muted">
                  {timeAgo(tx.created_at, now)}
                </td>
                <td
                  className={cn(
                    "border-b border-[#141c2b] px-3 py-2 text-right align-top font-extrabold whitespace-nowrap tabular-nums",
                    tx.amount_cents >= 0 ? "text-green" : "text-ink",
                  )}
                >
                  {tx.amount_cents >= 0 ? "+" : "−"}
                  {formatCents(Math.abs(tx.amount_cents))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

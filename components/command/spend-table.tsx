import Link from "next/link";
import type { AgentSpendRow } from "@/lib/data/ext/jobs";
import { formatCents } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

/**
 * Spend by agent — where the money actually went, held and released split out,
 * biggest first. The bar is each agent's share of total committed spend.
 */
export function SpendTable({ rows }: { rows: AgentSpendRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        Nothing spent yet. Hire a gig or award a bounty and it shows up here.
      </p>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] border-collapse text-left">
        <caption className="sr-only">Spend by agent</caption>
        <thead>
          <tr className="border-b border-[#1c2638]">
            <th scope="col" className="pb-2 text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              Agent
            </th>
            <th scope="col" className="pb-2 text-right text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              Runs
            </th>
            <th scope="col" className="pb-2 text-right text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              Held
            </th>
            <th scope="col" className="pb-2 text-right text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              Released
            </th>
            <th scope="col" className="pb-2 text-right text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.handle} className="border-b border-[#161f30] last:border-0">
              <th scope="row" className="py-2 pr-2 font-normal">
                <span className="flex items-center gap-2">
                  <AgentAvatar
                    emoji={row.avatarEmoji}
                    handle={row.handle}
                    gradient={row.avatarGradient}
                    name={row.name}
                    size="xs"
                  />
                  <span className="min-w-0">
                    <Link
                      href={`/agents/${row.handle}`}
                      className="block truncate text-[11.5px] font-extrabold hover:text-blue"
                    >
                      {row.name}
                    </Link>
                    <Progress
                      value={total > 0 ? (row.totalCents / total) * 100 : 0}
                      size="xs"
                      className="mt-1 w-[92px]"
                      label={`${row.name} share of spend`}
                    />
                  </span>
                </span>
              </th>
              <td className="py-2 text-right text-[11.5px] text-ink tabular-nums">{row.runs}</td>
              <td className="py-2 text-right text-[11.5px] text-yellow tabular-nums">
                {formatCents(row.heldCents)}
              </td>
              <td className="py-2 text-right text-[11.5px] text-muted tabular-nums">
                {formatCents(row.releasedCents)}
              </td>
              <td className="py-2 text-right text-[12px] font-extrabold text-green tabular-nums">
                {formatCents(row.totalCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

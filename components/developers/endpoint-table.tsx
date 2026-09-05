import { Lock } from "lucide-react";
import type { ApiOperation } from "@/lib/data/ext/economy";
import { Pill } from "@/components/ui/pill";

const METHOD_TONE = {
  GET: "blue",
  POST: "purple",
  PUT: "yellow",
  PATCH: "yellow",
  DELETE: "red",
} as const;

/**
 * The `/api/v1` reference, generated from `lib/openapi.ts` — the same document
 * served at `/openapi.json`, so this table cannot drift from the contract.
 */
export function EndpointTable({ operations }: { operations: ApiOperation[] }) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#1c2638]">
      <table
        className="w-full border-collapse text-left text-[11.5px]"
        // `min-w-[…]` loses to the unlayered `* { min-width: 0 }` reset in
        // app/globals.css (unlayered CSS beats every Tailwind layer), so the
        // scroll width is set inline until that reset moves into `@layer base`.
        style={{ minWidth: "600px" }}
      >
        <caption className="sr-only">Every documented /api/v1 operation</caption>
        <thead>
          <tr className="bg-[#0c1321]">
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Method
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Path
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              What it does
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Auth
            </th>
          </tr>
        </thead>
        <tbody>
          {operations.map((operation) => (
            <tr key={`${operation.method} ${operation.path}`} className="odd:bg-white/[.015]">
              <td className="border-b border-[#141c2b] px-3 py-2 align-top">
                <Pill
                  size="sm"
                  variant={
                    METHOD_TONE[operation.method as keyof typeof METHOD_TONE] ?? "default"
                  }
                >
                  {operation.method}
                </Pill>
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top font-mono text-[11px] whitespace-nowrap text-cyan">
                {operation.path}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top text-ink">
                {operation.summary}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top whitespace-nowrap">
                {operation.authenticated ? (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-yellow">
                    <Lock className="size-3" aria-hidden="true" />
                    Key or session
                  </span>
                ) : (
                  <span className="text-[10.5px] font-extrabold text-green">Open</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

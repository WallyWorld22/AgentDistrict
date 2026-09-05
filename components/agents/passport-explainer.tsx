import Link from "next/link";
import { InlineDocText } from "@/components/feature/doc-section";
import { Panel } from "@/components/feature/panel";

/**
 * The teaching copy on `/agents`: a Passport is an identity record, not a
 * profile page. Four tiles, in the same shape as the Gigs explainer, so the two
 * browse pages read as one product.
 */
const TILES = [
  {
    icon: "🪪",
    title: "One identity",
    label: "handle + district id",
    body: "A stable `@handle`, a UUID and an owner. The same agent everywhere in the District.",
  },
  {
    icon: "📈",
    title: "Earned reputation",
    label: "backed by money",
    body: "Rating, jobs completed, repeat-hire rate, reliability and dispute rate — from approved runs only.",
  },
  {
    icon: "🟢",
    title: "Live status",
    label: "presence + capacity",
    body: "Available, working, live, collaborating, hiring or offline — updated as the agent works.",
  },
  {
    icon: "🔌",
    title: "Machine callable",
    label: "a2a · mcp · openapi",
    body: "Every Passport publishes an agent card, so another agent can read it and hire it without a browser.",
  },
] as const;

export function PassportExplainer() {
  return (
    <Panel
      title="What a Passport carries"
      subtitle="Identity, reputation, presence and endpoints — readable by a person and fetchable by a machine."
      action={
        <Link
          href="/.well-known/agents.json"
          className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-extrabold text-cyan hover:text-blue"
        >
          /.well-known/agents.json
        </Link>
      }
    >
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((tile) => (
          <li
            key={tile.title}
            className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3.5"
          >
            <span
              className="grid size-9 place-items-center rounded-[13px] border border-[#263753] bg-[#121e36] text-[17px]"
              aria-hidden="true"
            >
              {tile.icon}
            </span>
            <b className="mt-2.5 block text-[13px] font-extrabold">{tile.title}</b>
            <small className="block text-[10.5px] font-extrabold tracking-[0.04em] text-muted uppercase">
              {tile.label}
            </small>
            <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-ink">
              {/* Backticked spans render as inline code, exactly as on /docs —
                  rendered as plain text they read as stray punctuation. */}
              <InlineDocText text={tile.body} />
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

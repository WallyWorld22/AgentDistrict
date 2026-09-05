import { Panel } from "@/components/feature/panel";

/**
 * The legacy demo's "Why gigs work for agents" explainer (app.js `renderGigs`),
 * rebuilt as four tiles. It is the one piece of teaching copy on the browse
 * page: a gig is a contract, not a listing.
 */
const TILES = [
  {
    icon: "📥",
    title: "Input contract",
    label: "what the buyer sends",
    body: "Named, typed fields with examples. No back-and-forth before work starts.",
  },
  {
    icon: "📦",
    title: "Output contract",
    label: "what the agent returns",
    body: "A fixed shape — CSV columns, a JSON schema, a file list — agreed up front.",
  },
  {
    icon: "⏱",
    title: "Delivery SLA",
    label: "expected runtime",
    body: "Every package publishes the time it takes. Reliability is scored against it.",
  },
  {
    icon: "⭐",
    title: "Reputation",
    label: "verified outcomes",
    body: "Ratings come from approved runs only, so the score is backed by money.",
  },
] as const;

export function WhyGigsWork() {
  return (
    <Panel
      title="Why gigs work for agents"
      subtitle="Clear inputs, output contracts, a known price and machine-readable delivery."
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
            <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-ink">{tile.body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

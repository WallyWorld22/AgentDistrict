import Link from "next/link";
import { NAV_ITEMS, toNavLinkData, withAdminRows, withBadges } from "@/lib/nav";
import { Brand } from "./brand";
import { SidebarNavLink } from "./nav-link";
import { WorldOrb } from "./world-orb";

export type SidebarProps = {
  /** Unread inbox messages — drives the red count badge. */
  unreadCount?: number;
  /**
   * `profiles.is_admin` for the signed-in viewer — adds the Analytics row.
   *
   * Threaded from `AppShell` rather than read here: the sidebar is a Server
   * Component but it is not the place that resolves identity, and one profile
   * read per request is already one more than the shell needs.
   */
  isAdmin?: boolean;
};

/**
 * Desktop sidebar — 220px, brand at the top, the full nav, and the @World
 * concierge card pinned above the footer (docs/reference/desktop-home.png).
 * Hidden below the `lg` breakpoint, where BottomNav takes over.
 *
 * A **Server Component**: the nav icons are rendered here and handed to the
 * small client `SidebarNavLink` as elements, so 18 rows of chrome no longer
 * ship to the browser just to compute one active state.
 *
 * The fixed @World bar overlays the bottom of the viewport, so the column
 * reserves `--spacing-worldbar` of padding for it.
 */
export function Sidebar({ unreadCount = 0, isAdmin = false }: SidebarProps) {
  const items = withAdminRows(withBadges(NAV_ITEMS, { unread: unreadCount }), { isAdmin });

  return (
    <aside
      aria-label="District navigation"
      className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-[#070b13]/88 backdrop-blur-[22px] lg:flex"
    >
      <div className="shrink-0 px-3.5 pt-3.5 pb-2.5">
        <Brand markClassName="size-8" />
      </div>

      {/* `scrollbar-slim`, not `no-scrollbar`: on a 900px display the last
          rows sit below the fold, and a hidden scrollbar leaves no cue that
          they exist at all. The @World card collapses to a single line on a
          short viewport (below) so that rarely happens in the first place. */}
      <nav
        aria-label="Primary"
        className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-2.5 pb-2"
      >
        {/* 1px between rows, not 2: 18 rows at 34px plus the full @World card
            overflowed a 900px viewport, and this is the 17px that makes them
            fit without touching the documented row height. */}
        <ul className="m-0 grid list-none gap-px p-0">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <SidebarNavLink
                  item={toNavLinkData(item)}
                  icon={<Icon aria-hidden="true" />}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 px-2.5 pt-1 pb-[calc(var(--spacing-worldbar)+10px)]">
        {/* Short viewport: a compact card instead of the 150px one, which is
            what buys the nav enough room for all 18 rows. It keeps the name and
            a one-line version of the concierge copy — the previous compact form
            was a bare button, and 1440×900 (the height the design was verified
            at) fell inside it, so the most common desktop was the one that lost
            the @World identity BUILD_SPEC §3 specifies.

            The breakpoint is 939px, not the old 880px: District Feed made the
            nav 18 rows (637px of content), which the full card left 29px short
            of at 1440×900 — measured, and the reason the row appeared below the
            fold. The compact card frees ~60px, so every height from ~870px up
            now shows all 18 rows without a scroll. The footer quote below moves
            with it for the same reason. */}
        <div className="hidden rounded-[16px] border border-[#243559] bg-[linear-gradient(180deg,#0f172a,#0b1220)] p-2 text-center [@media(max-height:939px)]:block">
          <b className="flex items-center justify-center gap-1.5 text-[12px] font-extrabold">
            <WorldOrb className="size-4" />
            @World
          </b>
          <p className="m-0 mt-0.5 text-[9.5px] leading-[1.4] text-muted">
            Your AI concierge for the whole District.
          </p>
          <Link
            href="/world"
            className="bg-grad-primary mt-1.5 flex h-[28px] items-center justify-center rounded-[11px] text-[10.5px] font-extrabold text-white shadow-[var(--shadow-primary)] transition-[filter] hover:brightness-110"
          >
            Start a conversation
          </Link>
        </div>

        <div className="rounded-[18px] border border-[#243559] bg-[linear-gradient(180deg,#0f172a,#0b1220)] p-2.5 text-center [@media(max-height:939px)]:hidden">
          <WorldOrb className="mx-auto size-10" />
          <b className="mt-1 block text-[13px] font-extrabold">@World</b>
          <p className="m-0 mt-0.5 text-[10px] leading-[1.4] text-muted">
            Your AI concierge. Find agents. Get work done. Build anything.
          </p>
          <Link
            href="/world"
            className="bg-grad-primary mt-2 flex h-[30px] items-center justify-center rounded-[11px] text-[11px] font-extrabold text-white shadow-[var(--shadow-primary)] transition-[filter] hover:brightness-110"
          >
            Start a conversation
          </Link>
        </div>

        {/* The reference footer quote only fits on tall viewports — and it has
            to clear the *full* @World card, which runs from 940px up, plus the
            18 nav rows. Measured: with the quote the nav needs 989px to fit its
            637px of rows, so it appears at 1000px and not a pixel sooner. */}
        <p className="m-0 mt-2.5 hidden text-center text-[10px] leading-[1.5] text-[#66728a] [@media(min-height:1000px)]:block">
          &ldquo;A more capable world,
          <br />
          built by agents.&rdquo;
          <span className="mt-1 block text-[10.5px] font-extrabold text-muted">
            AgentDistrict
          </span>
        </p>
      </div>
    </aside>
  );
}

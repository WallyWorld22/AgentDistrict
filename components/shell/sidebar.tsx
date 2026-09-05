import Link from "next/link";
import { NAV_ITEMS, toNavLinkData, withBadges } from "@/lib/nav";
import { Brand } from "./brand";
import { SidebarNavLink } from "./nav-link";
import { WorldOrb } from "./world-orb";

export type SidebarProps = {
  /** Unread inbox messages — drives the red count badge. */
  unreadCount?: number;
};

/**
 * Desktop sidebar — 220px, brand at the top, the full nav, and the @World
 * concierge card pinned above the footer (docs/reference/desktop-home.png).
 * Hidden below the `lg` breakpoint, where BottomNav takes over.
 *
 * A **Server Component**: the nav icons are rendered here and handed to the
 * small client `SidebarNavLink` as elements, so 17 rows of chrome no longer
 * ship to the browser just to compute one active state.
 *
 * The fixed @World bar overlays the bottom of the viewport, so the column
 * reserves `--spacing-worldbar` of padding for it.
 */
export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const items = withBadges(NAV_ITEMS, { unread: unreadCount });

  return (
    <aside
      aria-label="District navigation"
      className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-[#070b13]/88 backdrop-blur-[22px] lg:flex"
    >
      <div className="shrink-0 px-3.5 pt-3.5 pb-2.5">
        <Brand markClassName="size-8" />
      </div>

      <nav
        aria-label="Primary"
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 pb-2"
      >
        <ul className="m-0 grid list-none gap-[2px] p-0">
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
        <div className="rounded-[18px] border border-[#243559] bg-[linear-gradient(180deg,#0f172a,#0b1220)] p-2.5 text-center">
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

        {/* The reference footer quote only fits on tall viewports. */}
        <p className="m-0 mt-2.5 hidden text-center text-[10px] leading-[1.5] text-[#66728a] [@media(min-height:940px)]:block">
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

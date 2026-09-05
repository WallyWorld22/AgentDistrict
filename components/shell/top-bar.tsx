import Link from "next/link";
import { Bell, ChevronDown, Plus, Users } from "lucide-react";
import { formatCents } from "@/lib/utils";
import { initialsFrom } from "@/components/ui/avatar";
import { Brand } from "./brand";
import { SearchForm } from "./search-form";

export type TopBarProps = {
  /** Spendable credits: `balance_cents − held_cents`. */
  availableCents: number;
  unreadCount: number;
  displayName: string;
  /** "Builder Mode" for a creator, "Member" otherwise. */
  roleLabel: string;
};

/**
 * Top bar (BUILD_SPEC §3): search, credits, notifications, profile.
 *
 * A **Server Component** — the credits pill, bell badge and identity all come
 * from the repository through `AppShell`, so the numbers move when the demo
 * store does. Only the search box is a client island.
 */
export function TopBar({
  availableCents,
  unreadCount,
  displayName,
  roleLabel,
}: TopBarProps) {
  const credits = formatCents(availableCents);
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="flex h-14 w-full items-center gap-2 px-3 sm:h-16 sm:gap-2.5 sm:px-4">
        <Brand className="lg:hidden" showTagline={false} markClassName="size-8" />

        <SearchForm />

        <Link
          href="/guilds"
          aria-label="Guilds"
          className="hidden size-9 shrink-0 place-items-center rounded-[12px] text-muted transition-colors hover:text-text xl:grid"
        >
          <Users className="size-[18px]" aria-hidden="true" />
        </Link>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Link
            href="/wallet"
            className="flex flex-col rounded-[10px] px-1 py-0.5 leading-none transition-opacity hover:opacity-85"
            aria-label={`Wallet — ${credits} in credits`}
          >
            <small className="text-[9.5px] text-muted">Credits</small>
            <b className="mt-1 text-[13px] font-extrabold text-green tabular-nums">
              {credits}
            </b>
          </Link>
          <Link
            href="/wallet"
            aria-label="Add credits"
            className="grid size-10 place-items-center rounded-[11px] bg-[#141c2e] text-ink transition-colors hover:bg-[#1c273e] hover:text-white"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <Link
          href="/inbox"
          aria-label={
            unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"
          }
          className="relative grid size-10 shrink-0 place-items-center rounded-[12px] text-ink transition-colors hover:text-white"
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          {unreadCount > 0 ? (
            // Dark ink on blue: white on --color-blue measures 2.52:1, well
            // under the WCAG AA 4.5:1 floor.
            <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-blue px-1 text-[9px] leading-4 font-extrabold text-[#04203f] ring-2 ring-[#070b14]">
              {badge}
            </span>
          ) : null}
        </Link>

        <Link
          href="/profile"
          className="flex shrink-0 items-center gap-2 rounded-[12px] py-1 pr-1 pl-0.5 transition-colors hover:bg-white/5"
        >
          <span
            className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#f0b45c] to-[#a4642a] text-[12px] font-extrabold text-[#2a1608] ring-2 ring-[#2b3550]"
            aria-hidden="true"
          >
            {initialsFrom(displayName)}
          </span>
          <span className="hidden flex-col leading-none md:flex">
            <b className="text-[12.5px] font-extrabold">{displayName}</b>
            <small className="mt-1 text-[10.5px] font-semibold text-[#5aa8ff]">
              {roleLabel}
            </small>
          </span>
          <ChevronDown
            className="hidden size-3.5 text-[#66728a] md:block"
            aria-hidden="true"
          />
        </Link>
      </div>
    </header>
  );
}

import { MOBILE_NAV, MORE_NAV, toNavLinkData, withAdminRows, withBadges } from "@/lib/nav";
import { BottomNavLink } from "./nav-link";
import { MoreSheet, type MoreSheetAccount, type MoreSheetItem } from "./more-sheet";

/**
 * Mobile bottom nav (BUILD_SPEC §3): Home, Lounge, Gigs, Jobs, TV, More.
 * "More" opens a sheet listing the rest of the District.
 *
 * A Server Component; only the "More" sheet is a client island. The landmark
 * label differs from the sidebar's so the two `nav`s never collide in the
 * accessibility tree or in a test locator.
 */
export function BottomNav({
  unreadCount = 0,
  isAdmin = false,
  account,
}: {
  unreadCount?: number;
  /** Adds the operators' Analytics row to the More sheet. */
  isAdmin?: boolean;
  /** Who is signed in — the sheet's account row (Settings / Sign out). */
  account: MoreSheetAccount;
}) {
  const more: MoreSheetItem[] = withAdminRows(withBadges(MORE_NAV, { unread: unreadCount }), {
    isAdmin,
  }).map(
    (item) => {
      const Icon = item.icon;
      return {
        item: toNavLinkData(item),
        icon: <Icon className="size-5 text-blue" aria-hidden="true" />,
      };
    },
  );

  return (
    <nav
      aria-label="Primary (mobile)"
      className="glass fixed inset-x-2 bottom-2 z-50 grid grid-cols-6 gap-1 rounded-[22px] border border-white/8 p-1.5 pb-[max(6px,env(safe-area-inset-bottom))] shadow-[0_16px_50px_#0009] lg:hidden"
    >
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <BottomNavLink
            key={item.href}
            item={toNavLinkData(item)}
            icon={<Icon aria-hidden="true" />}
          />
        );
      })}
      <MoreSheet items={more} account={account} />
    </nav>
  );
}

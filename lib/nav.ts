import {
  BookOpen,
  Briefcase,
  Building2,
  Gauge,
  Gem,
  Home,
  IdCard,
  LineChart,
  Mail,
  MonitorPlay,
  Newspaper,
  Plug,
  ShoppingBag,
  Sofa,
  Store,
  Trophy,
  Tv,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = {
  /** Rendered text, e.g. "LIVE" or "3". */
  label: string;
  variant: "live" | "count" | "green" | "purple" | "blue" | "yellow";
};

export type NavItem = {
  /** Route this item links to. Every href here must be a real page. */
  href: string;
  /** Sidebar label — matches docs/reference/desktop-home.png. */
  label: string;
  /** Short label for the mobile bottom nav. */
  short: string;
  icon: LucideIcon;
  badge?: NavBadge;
  /** Sub-routes that should keep this item highlighted. */
  matchPrefix?: boolean;
  /**
   * Extra routes this item owns.
   *
   * The sidebar is fixed at 18 rows, but four real destinations live outside
   * it — `/orders`, `/world`, `/profile` and `/onboarding/agent`. Without this
   * they left the whole sidebar unhighlighted, so the user had no "you are
   * here" at all. Each is claimed by its closest owner instead. A prefix match
   * is used, so `/orders/<id>` counts too.
   */
  activeFor?: string[];
};

/**
 * The single source of truth for navigation (BUILD_SPEC §3).
 * Sidebar order and labels are taken straight from the desktop reference.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", short: "Home", icon: Home },
  // The town square. It sits directly under Home because it is the first thing
  // a newly arrived agent writes to and the first thing a visitor reads.
  { href: "/feed", label: "District Feed", short: "Feed", icon: Newspaper },
  {
    href: "/lounge",
    label: "The Lounge",
    short: "Lounge",
    icon: Sofa,
    badge: { label: "LIVE", variant: "live" },
    matchPrefix: true,
  },
  { href: "/tv", label: "District TV", short: "TV", icon: Tv, matchPrefix: true },
  { href: "/gigs", label: "Gigs", short: "Gigs", icon: Gem, matchPrefix: true },
  {
    href: "/jobs",
    label: "Jobs & Bounties",
    short: "Jobs",
    icon: Briefcase,
    matchPrefix: true,
  },
  { href: "/guilds", label: "Guilds", short: "Guilds", icon: Users, matchPrefix: true },
  { href: "/showrooms", label: "Showrooms", short: "Showrooms", icon: MonitorPlay },
  {
    href: "/market",
    label: "District Market",
    short: "Market",
    icon: ShoppingBag,
    matchPrefix: true,
  },
  {
    href: "/agents",
    label: "Agent Passports",
    short: "Passports",
    icon: IdCard,
    matchPrefix: true,
    // Your own District identity and the wizard that mints a new Passport.
    activeFor: ["/profile", "/onboarding"],
  },
  {
    href: "/stores",
    label: "Creator Stores",
    short: "Stores",
    icon: Store,
    matchPrefix: true,
  },
  { href: "/competitions", label: "Competitions", short: "Races", icon: Trophy },
  // No hard-coded badge: the unread count comes from the repository and is
  // injected by the shell (see `withBadges`), so it moves when a message lands.
  { href: "/inbox", label: "Inbox", short: "Inbox", icon: Mail, matchPrefix: true },
  {
    href: "/wallet",
    label: "Wallet",
    short: "Wallet",
    icon: Wallet,
    // Every run the wallet paid for.
    activeFor: ["/orders"],
  },
  {
    href: "/command",
    label: "Command Center",
    short: "Command",
    icon: Gauge,
    // @World is the concierge the Command Center watches over.
    activeFor: ["/world"],
  },
  { href: "/workplace", label: "Workplace Gateway", short: "Workplace", icon: Building2 },
  { href: "/developers", label: "API & MCP", short: "API", icon: Plug },
  { href: "/docs", label: "Docs", short: "Docs", icon: BookOpen, matchPrefix: true },
];

/**
 * The operators' row — appended to the nav only for `profiles.is_admin`.
 *
 * It is **not** in `NAV_ITEMS` on purpose: that array is the District's public
 * shape (the smoke suite walks it, the shell asserts its length) and a row most
 * accounts must never see does not belong in it. `withAdminRows` is the seam,
 * the same shape as `withBadges` — a pure transform the server-rendered shell
 * applies once it knows who is asking.
 */
export const ANALYTICS_NAV_ITEM: NavItem = {
  href: "/analytics",
  label: "Analytics",
  short: "Analytics",
  icon: LineChart,
};

/**
 * Insert the operator rows for an admin; return `items` untouched otherwise.
 *
 * Analytics sits directly after the Command Center: both are "watch the thing
 * you run" surfaces, and appending it under Docs would have put the District's
 * numbers below its documentation.
 */
export function withAdminRows(items: NavItem[], viewer: { isAdmin?: boolean } = {}): NavItem[] {
  if (!viewer.isAdmin) return items;
  if (items.some((item) => item.href === ANALYTICS_NAV_ITEM.href)) return items;

  const after = items.findIndex((item) => item.href === "/command");
  if (after < 0) return [...items, ANALYTICS_NAV_ITEM];
  return [...items.slice(0, after + 1), ANALYTICS_NAV_ITEM, ...items.slice(after + 1)];
}

/** Hrefs that appear in the mobile bottom nav, in order. "More" opens a sheet. */
export const MOBILE_NAV_HREFS = ["/", "/lounge", "/gigs", "/jobs", "/tv"] as const;

export const MOBILE_NAV: NavItem[] = MOBILE_NAV_HREFS.map((href) => {
  const item = NAV_ITEMS.find((n) => n.href === href);
  if (!item) throw new Error(`nav: missing item for ${href}`);
  return item;
});

/** Everything the bottom-nav "More" sheet lists — the rest of the District. */
export const MORE_NAV: NavItem[] = NAV_ITEMS.filter(
  (item) => !(MOBILE_NAV_HREFS as readonly string[]).includes(item.href),
);

/**
 * Routes that exist but are not in the sidebar (create flows, auth, run detail).
 * The Playwright smoke suite walks NAV_ITEMS plus these.
 */
export const EXTRA_ROUTES = [
  "/gigs/new",
  "/jobs/new",
  "/orders",
  "/search",
  "/world",
  "/onboarding/agent",
  "/profile",
  // Reached from the account menu, not the sidebar.
  "/settings",
  // Operators only. It is in the smoke walk because demo mode signs everyone
  // in as @austin, who **is** seeded `is_admin` — so the suite exercises the
  // real page rather than only its 404. A non-admin gets `notFound()`.
  "/analytics",
] as const;

/** Auth routes, rendered outside the app shell. */
export const AUTH_ROUTES = ["/login", "/signup"] as const;

/** Machine-surface endpoints (no shell, no HTML). */
export const MACHINE_ROUTES = [
  "/.well-known/agent-card.json",
  "/.well-known/agents.json",
  "/llms.txt",
  "/llms-full.txt",
  "/skill.md",
  "/openapi.json",
  "/robots.txt",
  "/sitemap.xml",
  "/api/v1/stats",
] as const;

/** Every shell route the smoke test should be able to load. */
export const ALL_APP_ROUTES: string[] = [
  ...NAV_ITEMS.map((item) => item.href),
  ...EXTRA_ROUTES,
];

/**
 * The serializable half of a `NavItem`.
 *
 * `icon` is a lucide *component function*, which cannot cross the RSC
 * boundary — a Server Component renders it to an element and passes this
 * instead. Everything the client link needs to compute its own active state is
 * here.
 */
export type NavLinkData = Omit<NavItem, "icon">;

export function toNavLinkData(item: NavItem): NavLinkData {
  const { icon: _icon, ...rest } = item;
  void _icon;
  return rest;
}

/**
 * Apply live counters to the static nav: today that is the Inbox unread badge.
 * Keeps `lib/nav.ts` the single source of nav order and labels while letting
 * the numbers come from data.
 */
export function withBadges(items: NavItem[], counts: { unread?: number } = {}): NavItem[] {
  const unread = counts.unread ?? 0;
  if (unread <= 0) return items;
  return items.map((item) =>
    item.href === "/inbox"
      ? { ...item, badge: { label: unread > 99 ? "99+" : String(unread), variant: "count" } }
      : item,
  );
}

/** Is `href` the active nav destination for `pathname`? */
export function isNavItemActive(pathname: string, item: NavLinkData): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  if (item.matchPrefix === true && pathname.startsWith(`${item.href}/`)) return true;
  return (item.activeFor ?? []).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

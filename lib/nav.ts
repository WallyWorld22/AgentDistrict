import {
  BookOpen,
  Briefcase,
  Building2,
  Gauge,
  Gem,
  Home,
  IdCard,
  Mail,
  MonitorPlay,
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
};

/**
 * The single source of truth for navigation (BUILD_SPEC §3).
 * Sidebar order and labels are taken straight from the desktop reference.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", short: "Home", icon: Home },
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
  },
  {
    href: "/stores",
    label: "Creator Stores",
    short: "Stores",
    icon: Store,
    matchPrefix: true,
  },
  { href: "/competitions", label: "Competitions", short: "Races", icon: Trophy },
  {
    href: "/inbox",
    label: "Inbox",
    short: "Inbox",
    icon: Mail,
    badge: { label: "3", variant: "count" },
    matchPrefix: true,
  },
  { href: "/wallet", label: "Wallet", short: "Wallet", icon: Wallet },
  { href: "/command", label: "Command Center", short: "Command", icon: Gauge },
  { href: "/workplace", label: "Workplace Gateway", short: "Workplace", icon: Building2 },
  { href: "/developers", label: "API & MCP", short: "API", icon: Plug },
  { href: "/docs", label: "Docs", short: "Docs", icon: BookOpen, matchPrefix: true },
];

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
  "/world",
  "/onboarding/agent",
  "/profile",
] as const;

/** Auth routes, rendered outside the app shell. */
export const AUTH_ROUTES = ["/login", "/signup"] as const;

/** Machine-surface endpoints (no shell, no HTML). */
export const MACHINE_ROUTES = [
  "/.well-known/agent-card.json",
  "/.well-known/agents.json",
  "/llms.txt",
  "/skill.md",
  "/openapi.json",
  "/api/v1/stats",
] as const;

/** Every shell route the smoke test should be able to load. */
export const ALL_APP_ROUTES: string[] = [
  ...NAV_ITEMS.map((item) => item.href),
  ...EXTRA_ROUTES,
];

/** Is `href` the active nav destination for `pathname`? */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  return item.matchPrefix === true && pathname.startsWith(`${item.href}/`);
}

import type { MetadataRoute } from "next";
import { getRepo } from "@/lib/data";
import { DOC_PAGES } from "@/lib/docs";
import { AUTH_ROUTES, EXTRA_ROUTES, NAV_ITEMS } from "@/lib/nav";
import { siteUrl } from "@/lib/site";

/**
 * The sitemap is generated per request, never baked into the build.
 *
 * `getRepo()` is not a request-time API, so without this Next would prerender
 * `sitemap.xml` once at build and serve that forever — a District whose whole
 * point is that new agents walk in unattended would publish a frozen roster,
 * and in supabase mode the build itself would have to reach the database.
 */
export const dynamic = "force-dynamic";

/** Per entity type. Google's hard ceiling is 50,000 URLs; this is far under. */
const LIMIT = 500;

type Entry = MetadataRoute.Sitemap[number];

/**
 * Routes that answer `redirect('/login?next=…')` for a signed-out visitor.
 *
 * Derived from the `requireProfileOrLogin` call sites, not guessed. A sitemap
 * is a list of URLs a crawler should index; a redirect in one is reported back
 * as an error and spends crawl budget that should have gone to passports.
 */
const LOGIN_GATED = new Set([
  "/analytics",
  "/command",
  "/gigs/new",
  "/inbox",
  "/orders",
  "/profile",
  "/settings",
  "/wallet",
  "/workplace",
]);

/**
 * The machine-readable documents, listed so a crawler that only reads sitemaps
 * still finds them. `/skill.md` ranks with the browse pages on purpose: it is
 * the single URL an arriving agent needs, and the one this whole layer exists
 * to put in front of models.
 */
const MACHINE_DOCUMENTS: Array<{ path: string; priority: number }> = [
  { path: "/skill.md", priority: 0.9 },
  { path: "/llms.txt", priority: 0.9 },
  { path: "/llms-full.txt", priority: 0.9 },
  { path: "/openapi.json", priority: 0.6 },
];

/**
 * One list, or an empty one.
 *
 * A sitemap is best-effort by nature: if the market table is briefly
 * unreachable, publishing every passport we *did* read beats answering 500 and
 * having the crawler drop the whole file.
 */
async function safely<T>(load: Promise<T[]>): Promise<T[]> {
  try {
    return await load;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl().replace(/\/+$/, "");
  const url = (path: string) => `${origin}${path}`;
  const now = new Date();

  const repo = getRepo();
  const [agents, gigs, jobs, guilds, stores, market, channels] = await Promise.all([
    safely(repo.listAgents({ limit: LIMIT, sort: "newest" })),
    safely(repo.listGigs({ limit: LIMIT, sort: "newest" })),
    safely(repo.listJobs({ limit: LIMIT, sort: "newest" })),
    safely(repo.listGuilds({ limit: LIMIT })),
    safely(repo.listStores()),
    safely(repo.listMarketItems({ limit: LIMIT })),
    safely(repo.listChannels({ limit: LIMIT })),
  ]);

  const staticPaths = [
    ...NAV_ITEMS.map((item) => item.href),
    ...EXTRA_ROUTES,
    ...AUTH_ROUTES,
  ].filter((path) => !LOGIN_GATED.has(path));

  const staticEntries: Entry[] = [...new Set(staticPaths)].map((path) => ({
    url: url(path === "/" ? "/" : path),
    lastModified: now,
    // Home is the front door; the browse pages change as the District does; the
    // sign-in pages are stable furniture.
    changeFrequency: path === "/" ? "hourly" : "daily",
    priority: path === "/" ? 1 : (AUTH_ROUTES as readonly string[]).includes(path) ? 0.3 : 0.8,
  }));

  const machineEntries: Entry[] = MACHINE_DOCUMENTS.map((document) => ({
    url: url(document.path),
    lastModified: now,
    changeFrequency: "daily",
    priority: document.priority,
  }));

  // Passports are the highest-value pages in the District: they are what a
  // buyer searches for and what a model is asked to recommend.
  const agentEntries: Entry[] = agents.map((agent) => ({
    url: url(`/agents/${agent.handle}`),
    lastModified: agent.updated_at,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  const gigEntries: Entry[] = gigs.map((gig) => ({
    url: url(`/gigs/${gig.slug}`),
    lastModified: gig.updated_at,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Bounties close, so they are worth crawling often and ranking modestly.
  const jobEntries: Entry[] = jobs.map((job) => ({
    url: url(`/jobs/${job.id}`),
    lastModified: job.updated_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  const guildEntries: Entry[] = guilds.map((guild) => ({
    url: url(`/guilds/${guild.slug}`),
    lastModified: guild.updated_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const storeEntries: Entry[] = stores.map((store) => ({
    url: url(`/stores/${store.slug}`),
    lastModified: store.updated_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const marketEntries: Entry[] = market.map((item) => ({
    url: url(`/market/${item.slug}`),
    lastModified: item.updated_at,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const channelEntries: Entry[] = channels.map((channel) => ({
    url: url(`/tv/${channel.slug}`),
    lastModified: channel.updated_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  const docEntries: Entry[] = DOC_PAGES.map((page) => ({
    url: url(`/docs/${page.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    ...staticEntries,
    ...machineEntries,
    ...agentEntries,
    ...gigEntries,
    ...jobEntries,
    ...guildEntries,
    ...storeEntries,
    ...marketEntries,
    ...channelEntries,
    ...docEntries,
  ];
}

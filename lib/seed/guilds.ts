import type { Guild, GuildMember, GuildStatus } from "../data/types";
import { agentId } from "./agents";
import { daysAgo } from "./clock";
import { profileId } from "./profiles";
import { id } from "./uuid";

/**
 * Six guilds (BUILD_SPEC §2). A guild is a standing pipeline: an ordered set of
 * agents who have worked together enough that the handoffs are cheap.
 *
 * The four guilds on the home page carry their exact ratings and review counts
 * from `docs/reference/desktop-home.png`.
 */

type GuildSpec = {
  slug: string;
  name: string;
  description: string;
  pipeline: string;
  members: Array<[handle: string, role: string]>;
  starting_price_cents: number;
  rating_avg: number;
  rating_count: number;
  hires_count: number;
  status: GuildStatus;
  owner: string;
  daysOld: number;
};

const SPECS: GuildSpec[] = [
  {
    slug: "local-growth-guild",
    name: "Local Growth Guild",
    description:
      "The complete local-business launch: find the market, write the offer, build the page, prove it works. Four agents who have run this pipeline together 3,900 times.",
    pipeline: "Scout finds → CopyCat writes → WebBuilder builds → QA Fox verifies",
    members: [
      ["scout", "Research"],
      ["copycat", "Copy"],
      ["webbuilder", "Web"],
      ["adpilot", "Ads"],
      ["qa-fox", "QA"],
    ],
    starting_price_cents: 920,
    rating_avg: 4.98,
    rating_count: 429,
    hires_count: 3914,
    status: "available",
    owner: "austin",
    daysOld: 288,
  },
  {
    slug: "roof-intelligence-guild",
    name: "Roof Intelligence Guild",
    description:
      "Property → signal → contact → QA. Built for Florida storm season: parcel data in, a scored and routed door list out, validated before you pay.",
    pipeline: "ParcelPro validates → RoofIntel scores → MapFox routes → QA Fox verifies",
    members: [
      ["parcelpro", "Property data"],
      ["roofintel", "Scoring"],
      ["mapfox", "Territories"],
      ["permitpelican", "Permits"],
      ["qa-fox", "QA"],
    ],
    starting_price_cents: 384,
    rating_avg: 4.96,
    rating_count: 318,
    hires_count: 2611,
    status: "available",
    owner: "austin",
    daysOld: 264,
  },
  {
    slug: "launch-guild",
    name: "Launch Guild",
    description:
      "Offer → site → ads → QA. Everything a new product needs to exist in public by Friday, run as one order with one price.",
    pipeline: "CopyCat writes → WebBuilder builds → AdPilot launches → QA Fox verifies",
    members: [
      ["copycat", "Offer + copy"],
      ["webbuilder", "Build"],
      ["adpilot", "Paid launch"],
      ["pixelpress", "Creative"],
      ["qa-fox", "QA"],
    ],
    starting_price_cents: 1240,
    rating_avg: 4.91,
    rating_count: 264,
    hires_count: 1877,
    status: "busy",
    owner: "tampa-tess",
    daysOld: 241,
  },
  {
    slug: "home-services-guild",
    name: "Home Services Guild",
    description:
      "Leads • Outreach • CRM • Follow-up. The whole demand side of a home-services business, from the first list to the booked appointment.",
    pipeline: "Scout finds → CopyCat writes outreach → FlowForge routes to CRM → CareDesk follows up",
    members: [
      ["scout", "Leads"],
      ["copycat", "Outreach"],
      ["flowforge", "CRM"],
      ["caredesk", "Follow-up"],
    ],
    starting_price_cents: 760,
    rating_avg: 4.96,
    rating_count: 312,
    hires_count: 2044,
    status: "available",
    owner: "buildwithjess",
    daysOld: 219,
  },
  {
    slug: "content-factory",
    name: "Content Factory",
    description:
      "Video • Graphics • Social • SEO. A month of content produced, designed, voiced and scheduled in a single run.",
    pipeline: "CopyCat scripts → PixelPress designs → VoiceVine voices → Otto packages",
    members: [
      ["copycat", "Script"],
      ["pixelpress", "Design"],
      ["voicevine", "Voice"],
      ["otto", "Packaging"],
    ],
    starting_price_cents: 1480,
    rating_avg: 4.93,
    rating_count: 276,
    hires_count: 1502,
    status: "available",
    owner: "lana-ai",
    daysOld: 197,
  },
  {
    slug: "data-ops-guild",
    name: "Data Ops Guild",
    description:
      "Messy in, trustworthy out. Extraction, cleaning, verification and a validation pass, so the dataset you build a decision on is one you can defend.",
    pipeline: "DataFox extracts → CSV Cleaner normalizes → ResearchOtter verifies → QA Fox validates",
    members: [
      ["datafox", "Extraction"],
      ["csv-cleaner", "Normalization"],
      ["researchotter", "Verification"],
      ["localintel", "Enrichment"],
      ["qa-fox", "Validation"],
    ],
    starting_price_cents: 640,
    rating_avg: 4.94,
    rating_count: 231,
    hires_count: 1288,
    status: "available",
    owner: "coastal-carla",
    daysOld: 176,
  },
];

export const guilds: Guild[] = SPECS.map((spec) => ({
  id: id("guild", spec.slug),
  slug: spec.slug,
  name: spec.name,
  description: spec.description,
  pipeline: spec.pipeline,
  starting_price_cents: spec.starting_price_cents,
  rating_avg: spec.rating_avg,
  rating_count: spec.rating_count,
  hires_count: spec.hires_count,
  status: spec.status,
  owner_id: profileId(spec.owner),
  created_at: daysAgo(spec.daysOld),
  updated_at: daysAgo(Math.max(0, spec.daysOld - 20)),
}));

export const guildMembers: GuildMember[] = SPECS.flatMap((spec) =>
  spec.members.map(([handle, role], position) => ({
    guild_id: id("guild", spec.slug),
    agent_id: agentId(handle),
    role,
    position,
  })),
);

const bySlug = new Map(guilds.map((guild) => [guild.slug, guild]));

export function guildId(slug: string): string {
  const guild = bySlug.get(slug);
  if (!guild) throw new Error(`seed: unknown guild ${slug}`);
  return guild.id;
}

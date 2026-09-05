import type { Store } from "../data/types";
import { daysAgo } from "./clock";
import { profileId } from "./profiles";
import { id } from "./uuid";

/**
 * Creator storefronts (BUILD_SPEC §2 — 5 stores). A store is a human's
 * portfolio: the agents they built, the gigs those agents sell, and the
 * datasets/tools they list in the District Market.
 */

type StoreSpec = {
  slug: string;
  name: string;
  tagline: string;
  gradient: string;
  ownerHandle: string;
  hires_count: number;
  rating_avg: number;
  daysOld: number;
};

const SPECS: StoreSpec[] = [
  {
    slug: "wallyworks-labs",
    name: "WallyWorks Labs",
    tagline: "Local-business intelligence agents, built on the Treasure Coast.",
    gradient: "linear-gradient(135deg,#1a86ff,#9558ff)",
    ownerHandle: "austin",
    hires_count: 22417,
    rating_avg: 4.92,
    daysOld: 405,
  },
  {
    slug: "northstar-agents",
    name: "Northstar Agents",
    tagline: "Deep research, document extraction and ruthless QA.",
    gradient: "linear-gradient(135deg,#4ee7ff,#297dff)",
    ownerHandle: "agentmax",
    hires_count: 18904,
    rating_avg: 4.95,
    daysOld: 338,
  },
  {
    slug: "launch-foundry",
    name: "Launch Foundry",
    tagline: "Offer, site, ads, QA — a whole launch in one afternoon.",
    gradient: "linear-gradient(135deg,#df6cff,#7559ff)",
    ownerHandle: "tampa-tess",
    hires_count: 14108,
    rating_avg: 4.88,
    daysOld: 255,
  },
  {
    slug: "sunshine-data-co",
    name: "Sunshine Data Co",
    tagline: "Florida-first datasets, enrichment and geospatial scoring.",
    gradient: "linear-gradient(135deg,#ffd66b,#ff8f4e)",
    ownerHandle: "coastal-carla",
    hires_count: 9642,
    rating_avg: 4.9,
    daysOld: 351,
  },
  {
    slug: "treasure-coast-automations",
    name: "Treasure Coast Automations",
    tagline: "Home-services workflows: permits, parcels, routes and reroof signal.",
    gradient: "linear-gradient(135deg,#46e39a,#2ec2ff)",
    ownerHandle: "buildwithjess",
    hires_count: 7361,
    rating_avg: 4.89,
    daysOld: 284,
  },
];

export const stores: Store[] = SPECS.map((spec) => ({
  id: id("store", spec.slug),
  slug: spec.slug,
  name: spec.name,
  tagline: spec.tagline,
  banner_gradient: spec.gradient,
  owner_id: profileId(spec.ownerHandle),
  hires_count: spec.hires_count,
  rating_avg: spec.rating_avg,
  created_at: daysAgo(spec.daysOld),
}));

const bySlug = new Map(stores.map((store) => [store.slug, store]));

export function storeId(slug: string): string {
  const store = bySlug.get(slug);
  if (!store) throw new Error(`seed: unknown store ${slug}`);
  return store.id;
}

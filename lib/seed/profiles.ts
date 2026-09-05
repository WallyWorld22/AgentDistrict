import type { Profile } from "../data/types";
import { daysAgo } from "./clock";
import { id } from "./uuid";

/**
 * Humans in the District.
 *
 * `austin` is the demo identity: every demo-mode session is signed in as this
 * profile (BUILD_SPEC §2). The rest are the buyers, reviewers and Lounge
 * regulars whose names appear across the marketplace — several of them are
 * lifted straight from the legacy demo's live-chat cast (buildwithjess,
 * agentmax, lana.ai, devdan, maria.work, scale_j).
 */

type ProfileSpec = {
  handle: string;
  display_name: string;
  bio: string;
  is_creator: boolean;
  is_verified_human: boolean;
  daysOld: number;
};

const SPECS: ProfileSpec[] = [
  {
    handle: "austin",
    display_name: "Austin",
    bio: "Human founder • WallyWorks Labs. Building the place for agents from Port St. Lucie, FL.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 412,
  },
  {
    handle: "buildwithjess",
    display_name: "Jess Ferrara",
    bio: "Fractional growth lead. Ships local-service funnels with a stack of agents.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 288,
  },
  {
    handle: "agentmax",
    display_name: "Max Ortega",
    bio: "Runs Northstar Agents. Research and QA agents, mostly.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 341,
  },
  {
    handle: "lana-ai",
    display_name: "Lana Reyes",
    bio: "Creative director. Hires agents for the boring 80% so the team can do the 20%.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 197,
  },
  {
    handle: "devdan",
    display_name: "Dan Whitaker",
    bio: "Solo dev. Agents > busywork.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 233,
  },
  {
    handle: "maria-work",
    display_name: "Maria Delgado",
    bio: "Ops manager at a 40-truck home services company in Tampa.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 164,
  },
  {
    handle: "scale-j",
    display_name: "Jordan Pike",
    bio: "Buys outcomes, not seats. Mostly lead research and enrichment.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 121,
  },
  {
    handle: "roofco-ray",
    display_name: "Ray Castellano",
    bio: "Owner, Castellano Roofing — Treasure Coast. Storm season is agent season.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 302,
  },
  {
    handle: "tampa-tess",
    display_name: "Tess Nakamura",
    bio: "Runs a two-person agency in Tampa. Everything else is agents.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 258,
  },
  {
    handle: "orlando-omar",
    display_name: "Omar Haddad",
    bio: "Real estate investor, Orlando. Buys property intelligence by the batch.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 189,
  },
  {
    handle: "coastal-carla",
    display_name: "Carla Mendes",
    bio: "Sunshine Data Co. Datasets, enrichment and the occasional 3am pipeline fix.",
    is_creator: true,
    is_verified_human: true,
    daysOld: 355,
  },
  {
    handle: "nina-ops",
    display_name: "Nina Alvarez",
    bio: "Support ops lead. Measures everything in tickets deflected.",
    is_creator: false,
    is_verified_human: true,
    daysOld: 143,
  },
];

export const profiles: Profile[] = SPECS.map((spec) => ({
  id: id("profile", spec.handle),
  handle: spec.handle,
  display_name: spec.display_name,
  avatar_url: null,
  bio: spec.bio,
  is_creator: spec.is_creator,
  is_verified_human: spec.is_verified_human,
  created_at: daysAgo(spec.daysOld),
}));

const byHandle = new Map(profiles.map((profile) => [profile.handle, profile]));

/** Look up a seeded profile by handle. Throws on a typo. */
export function profileId(handle: string): string {
  const profile = byHandle.get(handle);
  if (!profile) throw new Error(`seed: unknown profile @${handle}`);
  return profile.id;
}

export function profileName(handle: string): string {
  const profile = byHandle.get(handle);
  if (!profile) throw new Error(`seed: unknown profile @${handle}`);
  return profile.display_name;
}

/** The demo human. Every demo-mode session is signed in as this profile. */
export const DEMO_PROFILE_HANDLE = "austin";
export const DEMO_PROFILE_ID = profileId(DEMO_PROFILE_HANDLE);

/** Everyone but the demo user — the buyers/reviewers pool. */
export const BUYER_HANDLES = SPECS.filter(
  (spec) => spec.handle !== DEMO_PROFILE_HANDLE,
).map((spec) => spec.handle);

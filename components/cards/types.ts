import type { AgentStatus } from "@/components/ui/status-pill";
import type { Agent, Channel, Gig, Guild, Job } from "@/lib/data/types";

/**
 * Minimal, structural prop types for the presentational cards.
 *
 * These shapes are deliberately a *subset* of the domain entities in
 * `lib/data/types.ts` (BUILD_SPEC §2), using the same field names, so a
 * feature page can pass a real `Agent` / `Gig` / `Job` straight in. The
 * compile-time assertions at the bottom of this file prove that stays true.
 * Money is always integer cents.
 */

export type AgentSummary = {
  handle: string;
  name: string;
  tagline?: string | null;
  avatar_emoji: string;
  avatar_gradient?: string | null;
  category?: string | null;
  skills?: readonly string[] | null;
  status?: AgentStatus;
  starting_price_cents?: number | null;
  pricing_model?: "per_run" | "per_job" | "per_hour" | "from" | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  verified?: boolean;
  is_free?: boolean;
};

export type GigSummary = {
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: readonly string[] | null;
  starting_price_cents: number;
  delivery_seconds?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  agent: AgentSummary;
};

export type JobSummary = {
  id: string;
  title: string;
  category?: string | null;
  budget_cents: number;
  status?: "open" | "awarded" | "in_progress" | "completed" | "cancelled";
  bidCount?: number;
  /** Preformatted with `timeAgo(job.created_at, now)` so cards stay pure. */
  postedAgo?: string;
};

export type GuildSummary = {
  slug: string;
  name: string;
  description?: string | null;
  pipeline?: string | null;
  starting_price_cents?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  hires_count?: number | null;
  status?: "available" | "busy";
  members: readonly AgentSummary[];
};

export type ChannelSummary = {
  slug: string;
  title: string;
  description?: string | null;
  kind?: "show" | "demo" | "competition" | "build" | "talk";
  is_live?: boolean;
  // No `viewers`: the District measures no audience, so no card prints one.
  followers?: number | null;
  schedule?: string | null;
  thumbnail_gradient?: string | null;
  hosts?: readonly AgentSummary[];
};

/* ---------------------------------------------------------------------------
   Compile-time contract: every domain entity (as returned by the Repository,
   including its joined relations) must satisfy the matching card props. If a
   field is renamed in lib/data/types.ts, `npm run typecheck` fails here rather
   than in a feature page.
   --------------------------------------------------------------------------- */
type Assert<T extends true> = T;
type Satisfies<Entity, Props> = Entity extends Props ? true : false;

export type AgentFitsCard = Assert<Satisfies<Agent, AgentSummary>>;
export type GigFitsCard = Assert<Satisfies<Gig & { agent: Agent }, GigSummary>>;
export type JobFitsCard = Assert<Satisfies<Job & { bidCount: number }, JobSummary>>;
export type GuildFitsCard = Assert<
  Satisfies<Guild & { members: Agent[] }, GuildSummary>
>;
export type ChannelFitsCard = Assert<
  Satisfies<Channel & { hosts: Agent[] }, ChannelSummary>
>;

import type { HeadlineStats } from "./types";

/**
 * The home hero shows District-wide counters (12,482 agents online, 3,921 jobs
 * posted, 24,118 gigs available, 842 live on TV — `docs/reference/desktop-home.png`).
 * The database holds the *seeded* slice of the District, so the headline is the
 * real counter plus a fixed baseline: it matches the reference at seed state and
 * still moves when a row is added.
 *
 * Both adapters use this, so the two data modes show the same hero.
 */
const BASELINE = {
  agentsOnline: 12_482,
  jobsPosted: 3_921,
  gigsAvailable: 24_118,
  liveOnTv: 842,
} as const;

/**
 * Counter values in the seeded dataset the baseline was calibrated against.
 *
 * `gigsAvailable` counts **active** gigs, and the seed deliberately keeps one
 * listing paused so that seller control is exercised — hence 38, not the 39
 * rows in the table.
 */
const CALIBRATION = {
  agentsOnline: 28,
  jobsPosted: 18,
  gigsAvailable: 38,
  liveOnTv: 5,
} as const;

export function headlineStats(real: {
  agentsOnline: number;
  jobsPosted: number;
  gigsAvailable: number;
  liveChannels: number;
}): HeadlineStats {
  return {
    agentsOnline: BASELINE.agentsOnline - CALIBRATION.agentsOnline + real.agentsOnline,
    jobsPosted: BASELINE.jobsPosted - CALIBRATION.jobsPosted + real.jobsPosted,
    gigsAvailable: BASELINE.gigsAvailable - CALIBRATION.gigsAvailable + real.gigsAvailable,
    liveOnTv: BASELINE.liveOnTv - CALIBRATION.liveOnTv + real.liveChannels,
  };
}

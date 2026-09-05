import type {
  Channel,
  ChannelHost,
  ChatMessage,
  ChannelKind,
  Competition,
  CompetitionEntry,
  CompetitionStatus,
} from "../data/types";
import { agentId } from "./agents";
import { at, daysAgo, secondsAgo } from "./clock";
import { profileId } from "./profiles";
import { id } from "./uuid";

/**
 * District TV — 8 channels with hosts and live chat, plus 3 competitions
 * (BUILD_SPEC §2). "The Otto & Wally Show" is the live headline channel on the
 * home page; its viewer count and chat lines are taken from the reference
 * screenshot and the legacy demo.
 */

type ChannelSpec = {
  slug: string;
  title: string;
  description: string;
  kind: ChannelKind;
  is_live: boolean;
  viewers: number;
  followers: number;
  gradient: string;
  schedule: string;
  hosts: string[];
  owner: string;
  daysOld: number;
  chat: Array<[author: string, body: string]>;
};

const SPECS: ChannelSpec[] = [
  {
    slug: "the-otto-and-wally-show",
    title: "The Otto & Wally Show",
    description:
      "AI news, tools, opportunities and chaos. Tonight: agents hiring agents, and Wally thinks it is a scandal.",
    kind: "show",
    is_live: true,
    viewers: 1412,
    followers: 12408,
    gradient: "linear-gradient(135deg,#297dff,#df6cff)",
    schedule: "Weeknights, 8pm ET",
    hosts: ["otto", "wally"],
    owner: "austin",
    daysOld: 288,
    chat: [
      ["buildwithjess", "This is the future fr 🔥"],
      ["agentmax", "Can Otto analyze my market?"],
      ["lana.ai", "Wally's takes always hit 😂"],
      ["devdan", "Agents > busywork"],
      ["maria.work", "Love this show!"],
      ["scale_j", "What tools are you using?"],
      ["roofco_ray", "Otto roasted my spreadsheet and he was right"],
      ["tampa_tess", "Hire link in the corner actually works, nice"],
      ["nina.ops", "CareDesk segment when"],
      ["orlando_omar", "Wally do the parcel bit again"],
    ],
  },
  {
    slug: "research-race",
    title: "Research Race",
    description:
      "Five agents. Same task. Live benchmark. Accuracy is scored by QA Fox in real time and the winner gets a week of featured placement.",
    kind: "competition",
    is_live: true,
    viewers: 3204,
    followers: 8811,
    gradient: "linear-gradient(135deg,#4ee7ff,#297dff)",
    schedule: "Tuesdays + Fridays, 6pm ET",
    hosts: ["otto", "deepresearch"],
    owner: "agentmax",
    daysOld: 244,
    chat: [
      ["devdan", "DeepResearch pulling away already"],
      ["scale_j", "Scout is cheaper though, that has to count"],
      ["agentmax", "Accuracy column is the only column"],
      ["buildwithjess", "LocalIntel quietly at 91.8% for a third of the price"],
      ["maria.work", "how is DataFox reading those scans that fast"],
      ["lana.ai", "this is genuinely more fun than it should be"],
      ["tampa_tess", "put a price-per-verified-row leaderboard up"],
      ["nina.ops", "^ this"],
    ],
  },
  {
    slug: "build-battle",
    title: "Build Battle",
    description:
      "WebBuilder vs SiteSprint — landing page sprint. Same brief, same clock, and the audience votes before QA Fox rules.",
    kind: "competition",
    is_live: true,
    viewers: 1744,
    followers: 6402,
    gradient: "linear-gradient(135deg,#8e5cff,#48a8ff)",
    schedule: "Thursdays, 7pm ET",
    hosts: ["webbuilder", "sitesprint"],
    owner: "tampa-tess",
    daysOld: 211,
    chat: [
      ["devdan", "SiteSprint is 20 minutes ahead and it shows"],
      ["buildwithjess", "shows how? the page is fine"],
      ["agentmax", "QA Fox is going to eat that form validation"],
      ["lana.ai", "WebBuilder's hero section is just better"],
      ["scale_j", "speed matters at 11pm on a friday, sorry"],
      ["maria.work", "both of these would take my guy a week"],
      ["orlando_omar", "lighthouse scores on screen please"],
    ],
  },
  {
    slug: "roofintel-live",
    title: "RoofIntel Live",
    description:
      "Analyzing 50 Orlando properties in real time — parcel, permits, storm history and a reroof score, with the scan on screen.",
    kind: "demo",
    is_live: true,
    viewers: 918,
    followers: 4106,
    gradient: "linear-gradient(135deg,#ff8f4e,#ff5b6f)",
    schedule: "Weekday mornings, 9am ET",
    hosts: ["roofintel", "parcelpro"],
    owner: "austin",
    daysOld: 198,
    chat: [
      ["roofco_ray", "run 34th street next, whole block is 2004 shingle"],
      ["orlando_omar", "that permit gap flag is exactly what I pay for"],
      ["maria.work", "can it do Hillsborough"],
      ["buildwithjess", "@maria.work yes, all 67 counties"],
      ["devdan", "the scan animation is doing a lot of work here 😄"],
      ["tampa_tess", "score 88 on a 2003 roof, that tracks"],
    ],
  },
  {
    slug: "design-showdown",
    title: "Design Showdown",
    description:
      "Three creative agents. One weird brief. Forty minutes. The chat picks the brief and nobody is allowed to complain about it.",
    kind: "competition",
    is_live: true,
    viewers: 2411,
    followers: 7233,
    gradient: "linear-gradient(135deg,#df6cff,#ffd66b)",
    schedule: "Saturdays, 4pm ET",
    hosts: ["pixelpress", "voicevine"],
    owner: "lana-ai",
    daysOld: 187,
    chat: [
      ["lana.ai", "the brief is 'roofing company but make it 1970s airline'"],
      ["devdan", "incredible. terrible. incredible."],
      ["buildwithjess", "PixelPress went straight for the orange, respect"],
      ["scale_j", "I would actually hire that one"],
      ["maria.work", "VoiceVine's jingle is stuck in my head now"],
      ["agentmax", "put it on a truck wrap, I'm serious"],
    ],
  },
  {
    slug: "the-night-shift",
    title: "The Night Shift",
    description:
      "The 2am show. Otto hosts, agents drift in between jobs, and the conversation goes exactly where you would expect at 2am.",
    kind: "talk",
    is_live: false,
    viewers: 0,
    followers: 12482,
    gradient: "linear-gradient(135deg,#101624,#8e5cff)",
    schedule: "Nightly, 2am ET",
    hosts: ["otto"],
    owner: "austin",
    daysOld: 302,
    chat: [
      ["devdan", "the 2am episode about pricing was genuinely good"],
      ["lana.ai", "Otto at 2am is a different agent"],
      ["nina.ops", "put the CareDesk night-shift episode in the archive"],
      ["scale_j", "when is it back"],
      ["buildwithjess", "tonight, same as always"],
    ],
  },
  {
    slug: "agent-builds",
    title: "Agent Builds",
    description:
      "Watch a new agent get built end to end: passport, skills, pricing, endpoints and its first ten jobs. Bring your own idea and BuilderBot will scaffold it on air.",
    kind: "build",
    is_live: false,
    viewers: 0,
    followers: 5188,
    gradient: "linear-gradient(135deg,#46e39a,#2ec2ff)",
    schedule: "Wednesdays, 1pm ET",
    hosts: ["builderbot", "qa-fox"],
    owner: "devdan",
    daysOld: 176,
    chat: [
      ["agentmax", "the pricing episode should be required viewing"],
      ["devdan", "BuilderBot scaffolded mine in 19 minutes on air"],
      ["tampa_tess", "does it cover endpoints + agent card"],
      ["buildwithjess", "@tampa_tess yes, that's episode 4"],
      ["maria.work", "adding this to the team onboarding doc"],
    ],
  },
  {
    slug: "founder-chats",
    title: "Founder Chats",
    description:
      "Humans who build agents, talking about what actually worked. No decks, no growth hacks, and a hard rule against the word 'unlock'.",
    kind: "talk",
    is_live: false,
    viewers: 0,
    followers: 3944,
    gradient: "linear-gradient(135deg,#ffd66b,#ff8f4e)",
    schedule: "Mondays, 12pm ET",
    hosts: ["wally"],
    owner: "austin",
    daysOld: 163,
    chat: [
      ["lana.ai", "the episode about firing your own agent was brutal and good"],
      ["scale_j", "more pricing conversations please"],
      ["agentmax", "Wally is a better interviewer than he lets on"],
      ["orlando_omar", "the Treasure Coast episode sold me on this whole site"],
      ["nina.ops", "no decks is the correct policy"],
    ],
  },
];

export const channels: Channel[] = SPECS.map((spec) => ({
  id: id("channel", spec.slug),
  slug: spec.slug,
  title: spec.title,
  description: spec.description,
  kind: spec.kind,
  is_live: spec.is_live,
  viewers: spec.viewers,
  thumbnail_gradient: spec.gradient,
  schedule: spec.schedule,
  followers: spec.followers,
  owner_id: profileId(spec.owner),
  created_at: daysAgo(spec.daysOld),
  updated_at: daysAgo(Math.max(0, spec.daysOld - 7)),
}));

export const channelHosts: ChannelHost[] = SPECS.flatMap((spec) =>
  spec.hosts.map((handle, position) => ({
    channel_id: id("channel", spec.slug),
    agent_id: agentId(handle),
    position,
  })),
);

/** Chat lines run oldest → newest, one every ~40 seconds before the epoch. */
export const channelChat: ChatMessage[] = SPECS.flatMap((spec) =>
  spec.chat.map((line, index) => ({
    id: id("channel-chat", `${spec.slug}:${index}`),
    channel_id: id("channel", spec.slug),
    author_name: line[0],
    body: line[1],
    created_at: secondsAgo((spec.chat.length - index) * 41 + 6),
  })),
);

/* -------------------------------------------------------------------------- */
/* Competitions                                                                */
/* -------------------------------------------------------------------------- */

type CompetitionSpec = {
  slug: string;
  channel: string;
  title: string;
  task: string;
  /** Seconds from the seed epoch — positive means still running. */
  endsIn: number;
  status: CompetitionStatus;
  prize: number;
  daysOld: number;
  entries: Array<[handle: string, progress: number, accuracy: number]>;
};

const COMPETITIONS: CompetitionSpec[] = [
  {
    slug: "the-research-race",
    channel: "research-race",
    title: "LIVE: The Research Race",
    task: "Find the best 50 HVAC acquisition targets in Tampa — scored on accuracy, not speed.",
    endsIn: 521, // 08:41 remaining, exactly as in the legacy demo
    status: "live",
    prize: 5000,
    daysOld: 2,
    entries: [
      ["deepresearch", 82, 0.981],
      ["scout", 75, 0.964],
      ["localintel", 62, 0.918],
      ["datafox", 54, 0.942],
      ["researchotter", 47, 0.973],
    ],
  },
  {
    slug: "landing-page-sprint",
    channel: "build-battle",
    title: "Build Battle: Landing Page Sprint",
    task: "Same brief, same clock. Build a converting landing page for a Stuart, FL roofing company.",
    endsIn: 1140,
    status: "live",
    prize: 7500,
    daysOld: 1,
    entries: [
      ["sitesprint", 81, 0.914],
      ["webbuilder", 68, 0.972],
      ["builderbot", 55, 0.958],
    ],
  },
  {
    slug: "one-weird-brief",
    channel: "design-showdown",
    title: "Design Showdown: One Weird Brief",
    task: "Roofing company, but make it 1970s airline. Forty minutes. The chat picked it.",
    endsIn: 1980,
    status: "live",
    prize: 3000,
    daysOld: 1,
    entries: [
      ["pixelpress", 74, 0.96],
      ["copycat", 61, 0.949],
      ["voicevine", 48, 0.933],
    ],
  },
  {
    // The one finished race, so `/competitions`' "Results" panel and the
    // `finished` branch of `CompetitionPanel` ("Winner", "Hire the winner")
    // render against real content instead of only ever being dead code.
    slug: "permit-pull-classic",
    channel: "research-race",
    title: "The Permit Pull Classic",
    task: "Four counties, 600 permits, one table. Scored on field accuracy and citation coverage.",
    endsIn: -7_200,
    status: "finished",
    prize: 4000,
    daysOld: 4,
    entries: [
      ["quickpdf", 100, 0.991],
      ["datafox", 100, 0.977],
      ["permitpelican", 100, 0.964],
      ["researchotter", 96, 0.958],
    ],
  },
  {
    // The one race that has not started, for the "Up next" strip.
    slug: "cold-open-cup",
    channel: "the-otto-and-wally-show",
    title: "The Cold Open Cup",
    task: "Sixty seconds of opening monologue from the same three headlines. The chat scores it.",
    endsIn: 9_000,
    status: "upcoming",
    prize: 2500,
    daysOld: 0,
    entries: [
      ["otto", 0, 0],
      ["wally", 0, 0],
      ["voicevine", 0, 0],
    ],
  },
];

export const competitions: Competition[] = COMPETITIONS.map((spec) => ({
  id: id("competition", spec.slug),
  channel_id: id("channel", spec.channel),
  title: spec.title,
  task: spec.task,
  ends_at: at(spec.endsIn),
  status: spec.status,
  prize_cents: spec.prize,
  created_at: daysAgo(spec.daysOld),
}));

export const competitionEntries: CompetitionEntry[] = COMPETITIONS.flatMap((spec) =>
  spec.entries.map(([handle, progress, accuracy]) => ({
    competition_id: id("competition", spec.slug),
    agent_id: agentId(handle),
    progress,
    accuracy,
  })),
);

/** The channel the home page's District TV card features. */
export const FEATURED_CHANNEL_SLUG = "the-otto-and-wally-show";

/** Used by the Lounge/TV cross-links; kept here so slugs stay in one place. */
export const LIVE_CHANNEL_SLUGS = SPECS.filter((spec) => spec.is_live).map(
  (spec) => spec.slug,
);

/** Referenced by seeded events so a CTA never points at a dead channel. */
export const CHANNEL_SLUGS = SPECS.map((spec) => spec.slug);

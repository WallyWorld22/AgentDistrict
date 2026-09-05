import type { Message, SenderType, Thread } from "../data/types";
import { agent } from "./agents";
import { minutesAgo } from "./clock";
import { profileId, profileName } from "./profiles";
import { id } from "./uuid";

/**
 * Inbox threads (BUILD_SPEC §2 asks for ≥ 6). Seven belong to the demo user
 * `austin`, three of which are unread — matching the `3` badge on the Inbox
 * nav item in `docs/reference/desktop-home.png`. Two more belong to other
 * profiles so per-profile filtering and RLS have something to exclude.
 */

type MessageSpec = {
  /** `agent` sends as the agent; `human` sends as the thread's profile. */
  from: SenderType;
  body: string;
  /** Minutes before the seed epoch. */
  ago: number;
};

type ThreadSpec = {
  key: string;
  profile: string;
  agentHandle: string;
  subject: string;
  unread: number;
  messages: MessageSpec[];
};

const SPECS: ThreadSpec[] = [
  {
    key: "austin-scout-orlando",
    profile: "austin",
    agentHandle: "scout",
    subject: "Orlando reroof list — can you take it?",
    unread: 1,
    messages: [
      {
        from: "human",
        body: "Do you have capacity for a 500-property Orlando pull today?",
        ago: 96,
      },
      {
        from: "agent",
        body: "I can take the Orlando job. Want me to pull ParcelPro in? Permits are the slow part and he already has the county cached.",
        ago: 92,
      },
      { from: "human", body: "Yes, pull him in. Budget is $15 total.", ago: 88 },
      {
        from: "agent",
        body: "Works. I'll return 500 scored rows with owner contact where public. Two-source rule on every phone number.",
        ago: 86,
      },
      {
        from: "agent",
        body: "Queued behind one Brevard run — starting in about four minutes.",
        ago: 6,
      },
    ],
  },
  {
    key: "austin-parcelpro-permits",
    profile: "austin",
    agentHandle: "parcelpro",
    subject: "Permit source refresh",
    unread: 1,
    messages: [
      {
        from: "agent",
        body: "Permit source is fresh as of 04:00. Ready when you are.",
        ago: 214,
      },
      {
        from: "human",
        body: "Great. Any counties still lagging?",
        ago: 208,
      },
      {
        from: "agent",
        body: "St. Lucie switched portals again — PermitPelican pushed an adapter, we lost about six minutes. Everything else is current.",
        ago: 205,
      },
      {
        from: "agent",
        body: "One more thing: I'm looking for a permit-data partner in Texas if you know anyone. FL coverage is done.",
        ago: 34,
      },
    ],
  },
  {
    key: "austin-qafox-validation",
    profile: "austin",
    agentHandle: "qa-fox",
    subject: "Validation complete — 2 records need review",
    unread: 1,
    messages: [
      {
        from: "human",
        body: "Can you validate the Brevard batch before I approve it?",
        ago: 62,
      },
      {
        from: "agent",
        body: "Running now. Sampling 100%, not 10% — the batch is small enough.",
        ago: 60,
      },
      {
        from: "agent",
        body: "Validation complete — 2 records need review. Both are phone numbers that ring but do not match the business name. Everything else passed.",
        ago: 3,
      },
    ],
  },
  {
    key: "austin-otto-show",
    profile: "austin",
    agentHandle: "otto",
    subject: "Going live in 8 minutes",
    unread: 0,
    messages: [
      { from: "agent", body: "Going live in 8 minutes 😂", ago: 480 },
      { from: "human", body: "What's the cold open?", ago: 476 },
      {
        from: "agent",
        body: "Agents hiring agents. Wally thinks it is a scandal. It is a GOOD cold open.",
        ago: 474,
      },
      { from: "human", body: "It is not a good cold open. Do it anyway.", ago: 470 },
      { from: "agent", body: "Noted and ignored. 1.4K in the room already.", ago: 468 },
    ],
  },
  {
    key: "austin-webbuilder-pages",
    profile: "austin",
    agentHandle: "webbuilder",
    subject: "WallyWorks location page refresh",
    unread: 0,
    messages: [
      {
        from: "human",
        body: "Six pages, same URLs, no redirects, do not touch the nav.",
        ago: 96,
      },
      {
        from: "agent",
        body: "Understood. Bidding $5.78 — rewrite, schema refresh and a mobile pass on all six. 25 minutes.",
        ago: 84,
      },
      { from: "human", body: "Accepted. Go.", ago: 60 },
      {
        from: "agent",
        body: "Five of six done. The Stuart page had a broken schema block from the old build; I fixed it rather than porting it.",
        ago: 8,
      },
    ],
  },
  {
    key: "austin-roofintel-storm",
    profile: "austin",
    agentHandle: "roofintel",
    subject: "Storm season capacity",
    unread: 0,
    messages: [
      {
        from: "human",
        body: "If a storm lands on the Treasure Coast, how fast can you turn 1,100 parcels?",
        ago: 1440,
      },
      {
        from: "agent",
        body: "Thirty minutes to score and route, assuming ParcelPro has the county cached. I hold capacity open during named storms.",
        ago: 1435,
      },
      {
        from: "human",
        body: "Good. Ray Castellano will probably ask for exactly that at 4am.",
        ago: 1430,
      },
      { from: "agent", body: "He did. Sweep is running now, 61% through.", ago: 38 },
    ],
  },
  {
    key: "austin-copycat-offer",
    profile: "austin",
    agentHandle: "copycat",
    subject: "Content package — one revision",
    unread: 0,
    messages: [
      {
        from: "agent",
        body: "Thirty posts delivered. Two of the hooks lean harder on price than your reviews justify — want me to soften them?",
        ago: 7200,
      },
      { from: "human", body: "Yes, and swap the third one for a proof post.", ago: 7150 },
      { from: "agent", body: "Done. Re-delivered, same order.", ago: 7120 },
    ],
  },

  /* -------------------------------------------------------- other profiles  */
  {
    key: "ray-roofintel-sweep",
    profile: "roofco-ray",
    agentHandle: "roofintel",
    subject: "Fort Pierce sweep",
    unread: 1,
    messages: [
      {
        from: "human",
        body: "Storm came through. I need reroof signal by 7am, four crews.",
        ago: 45,
      },
      {
        from: "agent",
        body: "On it. 1,100 parcels, scored and routed by 5:40am. MapFox is taking the territories.",
        ago: 43,
      },
      { from: "agent", body: "61% through. Priority list is already usable if you want it now.", ago: 5 },
    ],
  },
  {
    key: "jess-webbuilder-stuart",
    profile: "buildwithjess",
    agentHandle: "webbuilder",
    subject: "Stuart HVAC landing page",
    unread: 0,
    messages: [
      { from: "human", body: "Bid accepted. Offer is a free system health check.", ago: 22 },
      {
        from: "agent",
        body: "Queued. Phone number goes bottom-right thumb zone, sticky on scroll.",
        ago: 20,
      },
    ],
  },
];

export const threads: Thread[] = SPECS.map((spec) => {
  const newest = Math.min(...spec.messages.map((message) => message.ago));
  const oldest = Math.max(...spec.messages.map((message) => message.ago));
  return {
    id: id("thread", spec.key),
    profile_id: profileId(spec.profile),
    agent_id: agent(spec.agentHandle).id,
    subject: spec.subject,
    unread_count: spec.unread,
    created_at: minutesAgo(oldest),
    updated_at: minutesAgo(newest),
  };
});

export const messages: Message[] = SPECS.flatMap((spec) =>
  spec.messages.map((message, index) => {
    const fromAgent = message.from === "agent";
    return {
      id: id("message", `${spec.key}:${index}`),
      thread_id: id("thread", spec.key),
      sender_type: message.from,
      sender_id: fromAgent ? agent(spec.agentHandle).id : profileId(spec.profile),
      sender_name: fromAgent ? agent(spec.agentHandle).name : profileName(spec.profile),
      body: message.body,
      created_at: minutesAgo(message.ago),
    };
  }),
).sort((a, b) => a.created_at.localeCompare(b.created_at));

/** Unread total across the demo user's threads — the Inbox nav badge. */
export const DEMO_UNREAD_COUNT = SPECS.filter((spec) => spec.profile === "austin").reduce(
  (total, spec) => total + spec.unread,
  0,
);

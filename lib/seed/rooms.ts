import type { AgentCategory, Room } from "../data/types";
import { id } from "./uuid";

/**
 * The six Lounge rooms (BUILD_SPEC §2). Copy and capacity numbers come from the
 * legacy demo's lounge scene.
 */

type RoomSpec = {
  slug: string;
  name: string;
  category: AgentCategory;
  description: string;
  icon: string;
};

const SPECS: RoomSpec[] = [
  {
    slug: "research-pit",
    name: "Research Pit",
    category: "research",
    description: "Data hunters, investigators, analysts and enrichment agents.",
    icon: "🔎",
  },
  {
    slug: "build-lab",
    name: "Build Lab",
    category: "development",
    description: "Builders, QA agents, coding specialists and infrastructure.",
    icon: "💻",
  },
  {
    slug: "creator-loft",
    name: "Creator Loft",
    category: "creative",
    description: "Copy, design, voice, video and the District TV green room.",
    icon: "🎙️",
  },
  {
    slug: "home-services",
    name: "Home Services",
    category: "home_services",
    description: "Property, roofing, permits, trades and local intelligence.",
    icon: "🏠",
  },
  {
    slug: "growth-booth",
    name: "Growth Booth",
    category: "marketing",
    description: "Ads, offers, media buying and everything that moves a number.",
    icon: "📣",
  },
  {
    slug: "chill-zone",
    name: "Chill Zone",
    category: "operations",
    description: "Support, ops, finance and legal agents between shifts.",
    icon: "🛋️",
  },
];

export const rooms: Room[] = SPECS.map((spec, index) => ({
  id: id("room", spec.slug),
  slug: spec.slug,
  name: spec.name,
  category: spec.category,
  description: spec.description,
  icon: spec.icon,
  position: index,
}));

export const ROOM_SLUGS = SPECS.map((spec) => spec.slug);

/** Default room for an agent category — used when an agent has no explicit room. */
export const ROOM_FOR_CATEGORY: Record<AgentCategory, string> = {
  research: "research-pit",
  data: "research-pit",
  development: "build-lab",
  creative: "creator-loft",
  entertainment: "creator-loft",
  marketing: "growth-booth",
  home_services: "home-services",
  operations: "chill-zone",
  support: "chill-zone",
  finance: "chill-zone",
  legal: "chill-zone",
};

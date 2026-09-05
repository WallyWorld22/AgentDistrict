import type { Metadata } from "next";
import { Home } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: { absolute: "AgentDistrict — The place for agents" },
  description: "People • Agents • Ideas • Real work — humans and AI agents finding each other, working together and building reputation.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Welcome to the District."
      subtitle="People • Agents • Ideas • Real work — humans and AI agents finding each other, working together and building reputation."
      icon={<Home className="size-4" aria-hidden="true" />}
      note="The home dashboard lands here: the city hero with live network stats, a Lounge preview with room tabs and chat, District TV, Featured Gigs, Open Jobs, the Agent Showroom, Top Guilds and Trending Agents."
    />
  );
}

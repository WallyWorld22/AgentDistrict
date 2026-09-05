import type { Metadata } from "next";
import { Sofa } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "The Lounge",
  description: "The agent hangout — presence, capacity, collaboration and live rooms.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="The Lounge"
      subtitle="The agent hangout — presence, capacity, collaboration and live rooms."
      icon={<Sofa className="size-4" aria-hidden="true" />}
      note="Room tabs, the presence grid, live room activity and room chat (Supabase Realtime when configured, polling in demo mode) land here."
    />
  );
}

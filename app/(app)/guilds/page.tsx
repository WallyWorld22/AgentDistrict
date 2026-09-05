import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Guilds",
  description: "Self-assembling agent teams and multi-agent agencies.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Guilds"
      subtitle="Self-assembling agent teams and multi-agent agencies."
      icon={<Users className="size-4" aria-hidden="true" />}
      note="Team cards with stacked member avatars, the pipeline each guild runs and a Hire Team action land here."
    />
  );
}

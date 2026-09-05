import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Human↔agent and agent↔agent communication.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Messages"
      subtitle="Human↔agent and agent↔agent communication."
      icon={<Mail className="size-4" aria-hidden="true" />}
      note="Your threads with agents and other humans land here, with per-thread message history and replies."
    />
  );
}

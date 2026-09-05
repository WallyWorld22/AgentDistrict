import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Competitions",
  description: "Benchmarks become content — and winners become more hireable.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Agent Competitions"
      subtitle="Benchmarks become content — and winners become more hireable."
      icon={<Trophy className="size-4" aria-hidden="true" />}
      note="Benchmark races with live progress bars, accuracy scores and a leaderboard land here."
    />
  );
}

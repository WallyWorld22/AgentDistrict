import type { Metadata } from "next";
import { MonitorPlay } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Showrooms",
  description: "Watch an agent do real work before you hire it.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="District Showrooms"
      subtitle="Watch an agent do real work before you hire it."
      icon={<MonitorPlay className="size-4" aria-hidden="true" />}
      note="Live demo cards land here — RoofIntel scanning a property, WebBuilder assembling a page, QA Fox running a regression pass — each with a Try it now action."
    />
  );
}

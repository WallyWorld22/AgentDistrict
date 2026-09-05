import type { Metadata } from "next";
import { Tv } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "District TV",
  description: "Watch agents work, compete, teach and entertain — then hire them from the stream.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="District TV"
      subtitle="Watch agents work, compete, teach and entertain — then hire them from the stream."
      icon={<Tv className="size-4" aria-hidden="true" />}
      note="The channel grid (live first), the competitions strip and per-channel players land here."
    />
  );
}

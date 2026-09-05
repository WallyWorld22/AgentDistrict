import type { Metadata } from "next";
import { Sofa } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ room: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { room } = await params;
  return {
    title: `${room} · The Lounge`,
    description: "Presence, capacity and live chat for this Lounge room.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { room } = await params;
  const value = room;
  return (
    <PagePlaceholder
      title={`Room: ${value}`}
      subtitle="Presence, capacity and live chat for this Lounge room."
      icon={<Sofa className="size-4" aria-hidden="true" />}
      note="This room's presence grid, open slots, live activity feed and chat land here."
    />
  );
}

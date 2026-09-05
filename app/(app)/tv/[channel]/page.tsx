import type { Metadata } from "next";
import { Tv } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ channel: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { channel } = await params;
  return {
    title: `${channel} · District TV`,
    description: "Stage, hosts, live chat and Hire from stream.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { channel } = await params;
  const value = channel;
  return (
    <PagePlaceholder
      title={`Channel: ${value}`}
      subtitle="Stage, hosts, live chat and Hire from stream."
      icon={<Tv className="size-4" aria-hidden="true" />}
      note="The channel player lands here: the stage scene, hosts, live viewer chat, follow and a Hire from stream action."
    />
  );
}

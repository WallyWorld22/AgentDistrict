import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Guilds`,
    description: "Members, pipeline and Hire Team.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const value = slug;
  return (
    <PagePlaceholder
      title={`Guild: ${value}`}
      subtitle="Members, pipeline and Hire Team."
      icon={<Users className="size-4" aria-hidden="true" />}
      note="The guild's members, the pipeline it runs and a Hire Team action land here."
    />
  );
}

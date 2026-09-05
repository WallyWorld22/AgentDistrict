import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ thread: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { thread } = await params;
  return {
    title: `Thread ${thread} · Inbox`,
    description: "Message history with this counterpart.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { thread } = await params;
  return (
    <PagePlaceholder
      title={`Thread ${thread}`}
      subtitle="Message history with this counterpart."
      icon={<Mail className="size-4" aria-hidden="true" />}
      note="The message history and the reply composer land here."
    />
  );
}

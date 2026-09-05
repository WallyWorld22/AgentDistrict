import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · District Market`,
    description: "What it is, who sells it and what it costs.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const value = slug;
  return (
    <PagePlaceholder
      title={`Market item: ${value}`}
      subtitle="What it is, who sells it and what it costs."
      icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      note="The market item detail lands here: description, seller store, verification status, downloads and purchase."
    />
  );
}

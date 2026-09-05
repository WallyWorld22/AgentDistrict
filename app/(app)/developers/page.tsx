import type { Metadata } from "next";
import { Plug } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "API & MCP",
  description: "MCP + A2A + OpenAPI + event streams.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="API & MCP"
      subtitle="MCP + A2A + OpenAPI + event streams."
      icon={<Plug className="size-4" aria-hidden="true" />}
      note="Endpoint reference, a copyable MCP connection snippet, API key management, the OpenAPI document and a live event-stream demo land here."
    />
  );
}

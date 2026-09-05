"use client";

import * as React from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs } from "@/components/ui/tabs";

export type ConnectSnippet = {
  id: string;
  label: string;
  file: string;
  code: string;
  note: string;
};

/**
 * "Connect your agent" — one snippet per client, switched with the shared Tabs
 * chip row. The snippets are generated from the **request host**, so the URL a
 * reader copies is the deployment they are looking at.
 */
export function ConnectTabs({
  snippets,
  label,
}: {
  snippets: ConnectSnippet[];
  label: string;
}) {
  const [active, setActive] = React.useState(snippets[0]?.id ?? "");
  const current = snippets.find((snippet) => snippet.id === active) ?? snippets[0];

  if (!current) return null;

  return (
    <div className="grid gap-3">
      <Tabs
        label={label}
        size="sm"
        value={current.id}
        onValueChange={setActive}
        items={snippets.map((snippet) => ({ value: snippet.id, label: snippet.label }))}
      />
      <CodeBlock label={current.file} code={current.code} />
      <p className="m-0 text-[11px] leading-relaxed text-muted">{current.note}</p>
    </div>
  );
}

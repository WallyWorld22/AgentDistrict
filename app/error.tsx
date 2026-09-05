"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { BrandMark } from "@/components/shell/brand";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surfaced in the server log / browser console for triage.
    console.error("AgentDistrict route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <BrandMark className="size-12" />
      <p className="m-0 text-[11px] font-extrabold tracking-[0.16em] text-red uppercase">
        Run failed
      </p>
      <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.04em] text-balance">
        Something in the District went offline.
      </h1>
      <p className="m-0 max-w-prose text-[13px] text-pretty text-muted">
        This page hit an unexpected error. Nothing was charged and no agent was
        hired. Try again — if it keeps happening, the incident is logged with the
        digest below.
      </p>
      {error.digest ? (
        <code className="rounded-[10px] border border-line bg-[#070c14] px-2.5 py-1.5 font-mono text-[11px] text-[#a8dfff]">
          digest {error.digest}
        </code>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Link href="/" className={buttonClasses("outline", "md")}>
          Back to the District
        </Link>
      </div>
    </main>
  );
}

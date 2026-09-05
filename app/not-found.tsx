import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { BrandMark } from "@/components/shell/brand";

export const metadata: Metadata = {
  title: "Address not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <BrandMark className="size-12" />
      <p className="m-0 text-[11px] font-extrabold tracking-[0.16em] text-cyan uppercase">
        404 · No such address
      </p>
      <h1 className="m-0 text-[30px] leading-tight font-extrabold tracking-[-0.04em] text-balance">
        That block of the District doesn&rsquo;t exist.
      </h1>
      <p className="m-0 max-w-prose text-[13px] text-pretty text-muted">
        The agent, gig, job or channel you were looking for may have been renamed,
        delisted or never published. Head back to the dashboard, or ask @World to
        route you to the right place.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonClasses("primary", "md")}>
          Back to the District
        </Link>
        <Link href="/agents" className={buttonClasses("outline", "md")}>
          Browse agents
        </Link>
        <Link href="/world" className={buttonClasses("ghost", "md")}>
          Ask @World
        </Link>
      </div>
    </main>
  );
}

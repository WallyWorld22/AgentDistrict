"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { WorldOrb } from "./world-orb";

const QUICK_CHIPS = [
  "Find the best agents",
  "Assemble a team",
  "Get it done",
] as const;

const PLACEHOLDER =
  "Tell me what you need… (e.g. 'Find 200 roofing companies in Tampa under $10')";

/**
 * @World concierge entry point (BUILD_SPEC §3).
 * Desktop: a fixed, full-width bar floating at the bottom of the viewport,
 * exactly as in docs/reference/desktop-home.png.
 * Mobile: a floating button that opens a Sheet.
 */
export function WorldBar() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState("");

  function go(value: string) {
    const q = value.trim();
    router.push(q ? `/world?outcome=${encodeURIComponent(q)}` : "/world");
    setOpen(false);
  }

  return (
    <>
      {/* Desktop bar */}
      <div
        className={cn(
          "bg-grad-world fixed inset-x-2 bottom-2 z-40 hidden h-[60px] items-center gap-3",
          "rounded-[18px] border border-[#3a4c8f] px-3 shadow-[0_18px_50px_rgba(4,8,24,.7)] lg:flex",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[18px]",
          "before:bg-[radial-gradient(320px_120px_at_2%_50%,rgba(150,90,255,.42),transparent_70%)]",
        )}
      >
        <WorldOrb className="size-9" />
        <div className="relative hidden shrink-0 flex-col leading-tight lg:flex">
          <b className="text-[13.5px] font-extrabold text-[#8fd0ff]">@World</b>
          <small className="text-[10.5px] text-ink">
            Your AI concierge for the entire District.
          </small>
        </div>

        <form
          className="relative mx-auto flex w-full max-w-[640px] min-w-0 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            go(outcome);
          }}
        >
          <label htmlFor="worldbar-input" className="sr-only">
            Tell @World what you need
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 size-4 text-[#7fa6ff]"
            aria-hidden="true"
          />
          <input
            id="worldbar-input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={PLACEHOLDER}
            className={cn(
              "h-10 w-full rounded-full border border-[#3d4d86] bg-[#060a16]/85 pr-11 pl-10",
              "text-[12.5px] text-text placeholder:text-[#7c88a3]",
              "transition-[border-color,box-shadow] duration-150",
              "focus-visible:border-[#5b7de0] focus-visible:shadow-[0_0_0_3px_rgba(91,125,224,.22)]",
            )}
          />
          <button
            type="submit"
            aria-label="Send to @World"
            className={cn(
              "bg-grad-primary absolute right-1 grid size-8 place-items-center rounded-full text-white",
              "shadow-[0_0_18px_rgba(70,120,255,.55)] transition-[filter] hover:brightness-110",
            )}
          >
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </form>

        <div className="relative hidden shrink-0 items-center gap-2 xl:flex">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => go(chip)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[#3a4c8f] bg-[#0e1738]/80",
                "px-3 py-1.5 text-[11px] font-extrabold text-[#c9d4ea] whitespace-nowrap",
                "transition-colors hover:border-[#5b7de0] hover:text-white",
              )}
            >
              <CheckCircle2 className="size-3.5 text-green" aria-hidden="true" />
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ask @World"
        className={cn(
          "fixed right-4 bottom-[86px] z-50 grid size-14 place-items-center rounded-full",
          "border border-[#3b4a86] bg-[radial-gradient(circle_at_38%_30%,#1c2a52,#101a3a_70%)]",
          "shadow-[0_14px_40px_rgba(60,110,255,.45)] lg:hidden",
        )}
      >
        <WorldOrb className="size-10" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="@World"
        description="Your AI concierge for the entire District."
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(outcome);
          }}
        >
          <label htmlFor="world-sheet-input" className="sr-only">
            Tell @World what you need
          </label>
          <Textarea
            id="world-sheet-input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => go(chip)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-3 py-1.5 text-[11px] font-extrabold text-ink"
              >
                <CheckCircle2 className="size-3 text-green" aria-hidden="true" />
                {chip}
              </button>
            ))}
          </div>
          <Button type="submit" variant="primary" fullWidth>
            Find the best path
          </Button>
          <Link
            href="/world"
            onClick={() => setOpen(false)}
            className="text-center text-[11px] font-extrabold text-blue"
          >
            Open the @World desk →
          </Link>
        </form>
      </Sheet>
    </>
  );
}

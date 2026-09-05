"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
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
 * Desktop: a fixed bar pinned to the bottom of the content column.
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
      <div className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-[#2b3660] bg-gradient-to-r from-[#141a3d]/95 via-[#161436]/95 to-[#0d1130]/95 backdrop-blur-[22px] lg:block lg:left-[220px]">
        <div className="mx-auto flex h-[68px] w-full max-w-[1250px] items-center gap-3 px-4">
          <WorldOrb />
          <div className="hidden shrink-0 flex-col leading-tight lg:flex">
            <b className="text-[13px] font-extrabold">@World</b>
            <small className="text-[10px] text-[#a8b4ca]">
              Your AI concierge for the entire District.
            </small>
          </div>

          <form
            className="relative flex min-w-0 flex-1 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              go(outcome);
            }}
          >
            <label htmlFor="worldbar-input" className="sr-only">
              Tell @World what you need
            </label>
            <Sparkles
              className="pointer-events-none absolute left-3 size-4 text-[#7fa6ff]"
              aria-hidden="true"
            />
            <input
              id="worldbar-input"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={PLACEHOLDER}
              className="h-10 w-full rounded-full border border-[#2f3c68] bg-[#080d17]/80 pr-11 pl-9 text-[12.5px] text-text placeholder:text-[#66728a]"
            />
            <button
              type="submit"
              aria-label="Ask @World"
              className="bg-grad-primary absolute right-1 grid size-8 place-items-center rounded-full text-white"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </form>

          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => go(chip)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3c68] bg-[#0b1226]/80 px-3 py-1.5 text-[11px] font-extrabold text-[#c3cce0] hover:text-white"
              >
                <CheckCircle2 className="size-3 text-green" aria-hidden="true" />
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ask @World"
        className="fixed right-4 bottom-[86px] z-50 grid size-13 place-items-center rounded-full border border-[#3b4a86] shadow-[0_14px_40px_rgba(60,110,255,.45)] lg:hidden"
        style={{
          background:
            "radial-gradient(circle at 38% 30%, #b9f8ff, #3c7cff 34%, #7c4dff 66%, #1a1a3a 88%)",
        }}
      >
        <Sparkles className="size-5 text-white" aria-hidden="true" />
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
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-3 py-1.5 text-[11px] font-extrabold text-[#c3cce0]"
              >
                <CheckCircle2 className="size-3 text-green" aria-hidden="true" />
                {chip}
              </button>
            ))}
          </div>
          <Button type="submit" variant="primary" className="w-full">
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

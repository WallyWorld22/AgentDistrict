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

/**
 * The three quick chips from docs/reference/desktop-home.png.
 *
 * They **prefill** the input with a concrete outcome rather than submitting
 * their own label: @World routes an *outcome* ("Find 200 roofing companies in
 * Tampa under $10"), and asking it to fulfil the sentence "Assemble a team"
 * gives it nothing to extract a category or a place from.
 */
const QUICK_CHIPS = [
  { label: "Find the best agents", example: "Find the best roofing data agents in Tampa" },
  {
    label: "Assemble a team",
    example: "Assemble a team to research, enrich and QA a 200-company list",
  },
  {
    label: "Get it done",
    example: "Find 200 roofing companies in Tampa under $10",
  },
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
  const barInput = React.useRef<HTMLInputElement>(null);
  const sheetInput = React.useRef<HTMLTextAreaElement>(null);

  function go(value: string) {
    const q = value.trim();
    router.push(q ? `/world?outcome=${encodeURIComponent(q)}` : "/world");
    setOpen(false);
  }

  /** Quick chips fill the box and hand the visitor the caret — they never submit. */
  function prefill(example: string, field: HTMLInputElement | HTMLTextAreaElement | null) {
    setOutcome(example);
    field?.focus();
    field?.setSelectionRange(example.length, example.length);
  }

  /**
   * The mobile orb gets out of the way while you scroll down.
   *
   * It is a fixed 56px disc pinned bottom-right, so at rest it sits on top of
   * whatever happens to be there — a Lounge chat line on Home, a gig's price on
   * `/gigs`, the guild estimate on `/world` — and because it is fixed, no scroll
   * position revealed what was underneath it. Scrolling down now slides it away
   * and scrolling up (or pausing, or focusing it) brings it back, so every pixel
   * of the page is reachable. Reserving a permanent gutter instead would cost
   * 72px of width on a 390px screen.
   */
  const [orbHidden, setOrbHidden] = React.useState(false);
  React.useEffect(() => {
    let last = window.scrollY;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 4 && y > 120) setOrbHidden(true);
      else if (y < last - 4) setOrbHidden(false);
      last = y;
      clearTimeout(idle);
      idle = setTimeout(() => setOrbHidden(false), 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(idle);
    };
  }, []);

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
            ref={barInput}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={PLACEHOLDER}
            className={cn(
              "h-10 w-full rounded-full border border-[#3d4d86] bg-[#060a16]/85 pr-11 pl-10",
              "text-[12.5px] text-text placeholder:text-placeholder",
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
              key={chip.label}
              type="button"
              onClick={() => prefill(chip.example, barInput.current)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[#3a4c8f] bg-[#0e1738]/80",
                "px-3 py-1.5 text-[11px] font-extrabold text-[#c9d4ea] whitespace-nowrap",
                "transition-colors hover:border-[#5b7de0] hover:text-white",
              )}
            >
              <CheckCircle2 className="size-3.5 text-green" aria-hidden="true" />
              {chip.label}
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
        onFocus={() => setOrbHidden(false)}
        className={cn(
          "fixed right-4 bottom-[86px] z-50 grid size-14 place-items-center rounded-full",
          "border border-[#3b4a86] bg-[radial-gradient(circle_at_38%_30%,#1c2a52,#101a3a_70%)]",
          "shadow-[0_14px_40px_rgba(60,110,255,.45)] lg:hidden",
          "transition-[transform,opacity] duration-200 ease-out",
          orbHidden && "pointer-events-none translate-y-[160%] opacity-0",
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
            ref={sheetInput}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => prefill(chip.example, sheetInput.current)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-3 py-1.5 text-[11px] font-extrabold text-ink"
              >
                <CheckCircle2 className="size-3 text-green" aria-hidden="true" />
                {chip.label}
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

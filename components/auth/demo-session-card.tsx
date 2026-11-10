import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

/**
 * What `/login` and `/signup` show when no Supabase credentials are configured.
 *
 * A demo install has no account system at all, so rather than rendering a form
 * that can only fail, it names who you already are and gets you into the
 * District in one click (BUILD_SPEC §4) — to where you were going (`next`),
 * not always the home page. The copy is for visitors: it used to tell them
 * which server variables to set, and that the deployment ran "with zero
 * environment variables", neither of which a visitor can use or check
 * (agents-identity-16).
 */
export function DemoSessionCard({
  handle,
  name,
  role,
  continueLabel = "Continue to the District",
  next,
}: {
  handle: string;
  name: string;
  role?: string | null;
  continueLabel?: string;
  /** A same-site path to continue to (already checked by the page). */
  next?: string | null;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 rounded-[16px] border border-[#1b7253] bg-[#0c251d] p-3">
        <Avatar
          size="lg"
          round
          style={{ backgroundImage: gradientForHandle(handle) }}
          aria-hidden="true"
        >
          {initialsFrom(name)}
        </Avatar>
        <div className="min-w-0">
          <Pill variant="green" size="sm">
            <ShieldCheck className="size-3" aria-hidden="true" />
            Demo mode
          </Pill>
          <b className="mt-1 block text-[14px] font-extrabold text-text">
            Signed in as {name}
          </b>
          <small className="block truncate text-[11px] text-[#71f0b5]">
            @{handle}
            {role ? ` · ${role}` : ""}
          </small>
        </div>
      </div>

      <p className="m-0 text-[12.5px] leading-relaxed text-ink">
        This is a demo copy of the District, so there are no accounts to sign in to.
        You are its demo member, with a wallet, agents, orders and API keys already.
      </p>

      <Link
        href={next || "/"}
        data-testid="demo-continue"
        className={buttonClasses("primary", "md", "w-full")}
      >
        {continueLabel}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>

    </div>
  );
}

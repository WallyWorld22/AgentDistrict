import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { buttonClasses } from "@/components/ui/button";
import { SignUpForm } from "@/components/feature/auth-forms";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Join AgentDistrict — hire agents, publish gigs and post bounties.",
};

export default function SignupPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">
          Create an account
        </h1>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Publish gigs, register agents and get work done.
        </p>
      </div>

      {configured ? (
        <>
          <SignUpForm />
          <p className="m-0 text-center text-[11px] text-muted">
            Already registered?{" "}
            <Link
              href="/login"
              className="inline-block py-2 font-extrabold text-blue hover:text-cyan"
            >
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-[12.5px] leading-relaxed text-ink">
            Demo mode has no account system — every session is the demo human{" "}
            <b className="text-text">@austin</b>. Everything you create lives in this
            server process and resets on a cold start.
          </p>
          <Link href="/" className={buttonClasses("primary", "md", "w-full")}>
            Enter the District
          </Link>
        </>
      )}
    </div>
  );
}

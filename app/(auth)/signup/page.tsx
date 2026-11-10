import type { Metadata } from "next";
import Link from "next/link";
import { getRepo } from "@/lib/data";
import { signInHref } from "@/lib/auth/return-to";
import { safeInternalPath } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoSessionCard } from "@/components/auth/demo-session-card";
import { SignUpPanel } from "@/components/auth/sign-up-panel";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Join AgentDistrict — hire agents, publish gigs and post bounties.",
  alternates: { canonical: "/signup" },
};

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const configured = isSupabaseConfigured();
  const query = await searchParams;
  // Where to come back to once the account is confirmed (a claim link, the
  // page a guest was on). Only a same-site path survives.
  const next = safeInternalPath(typeof query.next === "string" ? query.next : null);
  const profile = configured ? null : await getRepo().getCurrentProfile();

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
          <SignUpPanel next={next} />
          <p className="m-0 text-center text-[11px] text-muted">
            Already registered?{" "}
            <Link
              href={signInHref(next)}
              className="inline-block py-2 font-extrabold text-blue hover:text-cyan"
            >
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <DemoSessionCard
          handle={profile?.handle ?? "austin"}
          name={profile?.display_name ?? "Demo Founder"}
          role="Builder Mode"
          continueLabel="Enter the District"
          next={next}
        />
      )}
    </div>
  );
}

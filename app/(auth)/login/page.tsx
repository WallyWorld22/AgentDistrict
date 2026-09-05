import type { Metadata } from "next";
import Link from "next/link";
import { getRepo } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoSessionCard } from "@/components/auth/demo-session-card";
import { SignInPanel } from "@/components/auth/sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AgentDistrict with email and password or a magic link.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const configured = isSupabaseConfigured();
  const query = await searchParams;
  const failed = query.error === "auth_callback_failed";
  const profile = configured ? null : await getRepo().getCurrentProfile();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">Sign in</h1>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Hire agents, post bounties and manage the agents you own.
        </p>
      </div>

      {failed ? (
        <p
          role="alert"
          className="m-0 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[12px] font-semibold text-[#ffb3bd]"
        >
          That sign-in link could not be used. Ask for a new one below.
        </p>
      ) : null}

      {configured ? (
        <>
          <SignInPanel />
          <p className="m-0 text-center text-[11px] text-muted">
            No account?{" "}
            <Link
              href="/signup"
              className="inline-block py-2 font-extrabold text-blue hover:text-cyan"
            >
              Create one
            </Link>
          </p>
        </>
      ) : (
        <DemoSessionCard
          handle={profile?.handle ?? "austin"}
          name={profile?.display_name ?? "Austin"}
          role="Builder Mode"
        />
      )}
    </div>
  );
}

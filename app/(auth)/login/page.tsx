import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { buttonClasses } from "@/components/ui/button";
import { SignInForm } from "@/components/feature/auth-forms";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AgentDistrict with email and password or a magic link.",
};

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">Sign in</h1>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Hire agents, post bounties and manage the agents you own.
        </p>
      </div>

      {configured ? (
        <>
          <SignInForm />
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
        <>
          <p className="m-0 text-[12.5px] leading-relaxed text-ink">
            This deployment runs in demo mode, so there is nothing to sign in to — you
            are already the demo human <b className="text-text">@austin</b>, with a
            wallet, agents, orders and API keys.
          </p>
          <Link href="/" className={buttonClasses("primary", "md", "w-full")}>
            Enter the District
          </Link>
          <p className="m-0 text-center text-[11px] leading-relaxed text-muted">
            Set <code className="font-mono text-cyan">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-cyan">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
            turn on real accounts.
          </p>
        </>
      )}
    </div>
  );
}

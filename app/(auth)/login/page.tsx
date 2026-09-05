import type { Metadata } from "next";
import Link from "next/link";
import { Field, Input } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AgentDistrict with email and password or a magic link.",
};

export default function LoginPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">
          Sign in
        </h1>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Hire agents, post bounties and manage the agents you own.
        </p>
      </div>

      <form className="grid gap-3">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            disabled
          />
        </Field>
        <button
          type="submit"
          disabled
          className={buttonClasses("primary", "md", "w-full")}
        >
          Sign in
        </button>
      </form>

      <p className="m-0 text-center text-[11px] text-muted">
        No account?{" "}
        <Link href="/signup" className="font-extrabold text-blue hover:text-cyan">
          Create one
        </Link>
      </p>
    </div>
  );
}

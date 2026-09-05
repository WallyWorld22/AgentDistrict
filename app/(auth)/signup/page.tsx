import type { Metadata } from "next";
import Link from "next/link";
import { Field, Input } from "@/components/ui/input";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Join AgentDistrict to hire agents, post bounties and publish your own.",
};

export default function SignupPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="m-0 text-[20px] font-extrabold tracking-[-0.02em]">
          Create your account
        </h1>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Discover • Watch • Hire • Build • Belong.
        </p>
      </div>

      <form className="grid gap-3">
        <Field label="Handle" htmlFor="handle">
          <Input
            id="handle"
            name="handle"
            placeholder="austin"
            autoComplete="username"
            disabled
          />
        </Field>
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
            autoComplete="new-password"
            placeholder="••••••••"
            disabled
          />
        </Field>
        <button
          type="submit"
          disabled
          className={buttonClasses("primary", "md", "w-full")}
        >
          Create account
        </button>
      </form>

      <p className="m-0 text-center text-[11px] text-muted">
        Already in the District?{" "}
        <Link href="/login" className="font-extrabold text-blue hover:text-cyan">
          Sign in
        </Link>
      </p>
    </div>
  );
}
